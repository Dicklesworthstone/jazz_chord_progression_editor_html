/**
 * V2 progression-optimizer contract validator.
 *
 * Independent authority check for the fixtures under
 * tests/fixtures/progression-optimizer/. This script never imports src/ and
 * restates every frozen constant locally; expectations are recomputed with
 * its own reference implementations (an exhaustive chain enumerator plus a
 * unit-resumable reference beam stepper) written against
 * docs/V2_PROGRESSION_OPTIMIZER_CONTRACT.md alone.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type V2ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type V2ContractValidationReport = Readonly<{
  schema: "changes.validation.v2-contract.v1";
  package: "V2";
  outcome: "pass" | "fail";
  counts: Readonly<{
    files: number;
    cases: number;
    optimizeCases: number;
    refusalCases: number;
    stepperCases: number;
    bruteForceCertifiedCases: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  findings: readonly V2ContractFinding[];
}>;

export const V2_FINDING_CODES = Object.freeze([
  "V2_FILES",
  "V2_SCHEMA",
  "V2_MANIFEST",
  "V2_CASE",
  "V2_EXPECTATION",
  "V2_COUNTER",
  "V2_REALIZATION",
  "V2_REFUSAL",
  "V2_DEGRADATION",
  "V2_CONFLICT",
  "V2_STEPPER",
  "V2_TRACE",
  "V2_PROVENANCE",
] as const);

export const V2_FIXTURE_FILES = Object.freeze([
  "boundary-cases.json",
  "limit-cases.json",
  "mutation-controls.json",
  "optimization-cases.json",
  "provenance-ledger.json",
  "stepper-cases.json",
  "trace-ledger.json",
  "v2-progression-optimizer-contract.json",
] as const);

const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/progression-optimizer",
);

/** Locally restated frozen constants; the src module never certifies itself. */
const LOCAL = Object.freeze({
  candidatesPerEvent: 24,
  beamWidth: 48,
  windowEvents: 512,
  requestEvents: 8192,
  windowsPerSegment: 16,
  segments: 8192,
  locksPerEvent: 7,
  requestIdPattern: /^[A-Za-z0-9._-]{1,128}$/u,
  quantumUnits: 48 * 24,
  maxWorkQuanta: 8192,
  totalWorkUnits: 8192 * 1152,
  layerGeneratedStates: 1152,
  retainedStates: 48 * 512,
  trackedStates: 48 * 512 + 1152,
  oracleCallsPerLayer: 576,
  oracleTransitionCalls: 8192 * 576,
  alternatives: 48,
  realizationRecords: 48 * 8192,
  chainTransitions: 8191,
  costTransitions: 8192,
});

const COST_AXES = Object.freeze([
  "totalAbsoluteMotion",
  "maximumAbsoluteLeap",
  "commonTonesLost",
  "crowdedLowIntervals",
  "doubledGuideTones",
  "omittedColors",
  "totalSpan",
] as const);
const COST_AGGREGATIONS = Object.freeze([
  "sum",
  "max",
  "sum",
  "sum",
  "sum",
  "sum",
  "max",
] as const);
const COST_VALUE_LIMITS = Object.freeze([
  8192 * 889,
  127,
  8192 * 7,
  8192 * 6,
  8192 * 6,
  8192 * 16,
  127,
] as const);
const FAMILIES = Object.freeze([
  "balanced",
  "shell",
  "rootless-a",
  "rootless-b",
  "open",
  "drop2",
  "quartal",
] as const);
const REFUSAL_CODES = Object.freeze([
  "progression.schema_invalid",
  "progression.policy_invalid",
  "progression.identity_invalid",
  "progression.request_id_invalid",
  "progression.quantum_budget_invalid",
  "progression.event_count_exceeded",
  "progression.event_invalid",
  "progression.candidate_invalid",
  "progression.constraint_invalid",
  "progression.resume_stale",
  "progression.resume_invalid",
  "limit.progression_work_exceeded",
] as const);
const WORK_COUNTERS = Object.freeze([
  "workQuanta",
  "workUnits",
  "seededStates",
  "statePairExpansions",
  "oracleTransitionCalls",
  "oracleRefusedTransitions",
  "generatedStates",
  "dominancePrunes",
  "beamEvictions",
  "constraintFilteredCandidates",
  "loopClosureUnits",
  "loopClosureRefusals",
  "windowsOptimized",
  "segmentsOptimized",
] as const);
const MEMORY_COUNTERS = Object.freeze([
  "peakFrontierStates",
  "peakLayerGeneratedStates",
  "peakTrackedStates",
  "peakRealizationRecords",
] as const);
const TERMINATIONS = Object.freeze([
  "complete",
  "exhausted",
  "cancelled",
  "work-quanta-cap",
] as const);
const CANCEL_REASONS = Object.freeze(["user-cancel", "stale-revision"] as const);
const DEGRADATION_REASONS = Object.freeze([
  "window-partition",
  "beam-eviction",
  "fixed-candidate-constraint-conflict",
  "loop-closure-skipped",
] as const);
const REQUEST_SCHEMA = "changes.theory.progression-optimizer-request.v1";
const WORK_UNIT_IDENTITY =
  "workUnits = seededStates + statePairExpansions + loopClosureUnits";
const EVIDENCE_OWNER_PATTERN =
  /^tests\/(?:unit|integration)\/[a-z0-9-]+\.test\.ts$/u;
const STATIC_EVIDENCE_OWNER = "tests/static/v2-contract.test.ts";
const CONSTRAINT_KIND_ORDER = Object.freeze([
  "families",
  "range",
  "bassRange",
  "lock",
  "loop-closure",
  "transition-no-assignment",
] as const);

type WorkCounterName = (typeof WORK_COUNTERS)[number];
type MemoryCounterName = (typeof MEMORY_COUNTERS)[number];
type CostTuple = readonly number[];

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as JsonObject;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

class Findings {
  readonly list: V2ContractFinding[] = [];
  add(code: string, path: string, message: string): void {
    this.list.push({ code, path, message });
  }
  equal(
    code: string,
    path: string,
    actual: unknown,
    expected: unknown,
    label: string,
  ): void {
    const left = canonicalJson(actual);
    const right = canonicalJson(expected);
    if (left !== right) {
      this.add(code, path, `${label}: expected ${right}, recomputed ${left}`);
    }
  }
}

/** RFC-6901-style pointer application used by the mutation static test. */
export function applyMutation(
  document: unknown,
  mutation: Readonly<{ operation: string; pointer: string; value?: unknown }>,
): unknown {
  const clone: unknown = JSON.parse(JSON.stringify(document));
  const parts = mutation.pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (parts.length === 0) throw new Error("empty pointer");
  let parent: unknown = clone;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[Number(part)];
    else if (typeof parent === "object" && parent !== null)
      parent = (parent as JsonObject)[part];
    else throw new Error(`unresolvable pointer ${mutation.pointer}`);
  }
  const leaf = parts[parts.length - 1] ?? "";
  if (Array.isArray(parent)) {
    const index = Number(leaf);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      throw new Error(`unresolvable pointer ${mutation.pointer}`);
    }
    if (mutation.operation === "remove") parent.splice(index, 1);
    else parent[index] = mutation.value;
    return clone;
  }
  if (typeof parent !== "object" || parent === null) {
    throw new Error(`unresolvable pointer ${mutation.pointer}`);
  }
  const record = parent as JsonObject;
  if (!(leaf in record)) {
    throw new Error(`unresolvable pointer ${mutation.pointer}`);
  }
  if (mutation.operation === "remove") Reflect.deleteProperty(record, leaf);
  else record[leaf] = mutation.value;
  return clone;
}

function resolvePointer(document: unknown, pointer: string): unknown {
  let cursor: unknown = document;
  for (const raw of pointer.split("/").slice(1)) {
    const part = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(cursor)) cursor = cursor[Number(part)];
    else if (typeof cursor === "object" && cursor !== null)
      cursor = (cursor as JsonObject)[part];
    else return undefined;
  }
  return cursor;
}

/* ------------------------------------------------------------------ */
/* Case expansion                                                     */
/* ------------------------------------------------------------------ */

type CompactCandidate = Readonly<{
  candidateId: string;
  family: string;
  voiceMidis: readonly number[];
}>;

type CompactConstraints = Readonly<{
  families: readonly string[] | null;
  range: Readonly<{ lowMidi: number; highMidi: number }> | null;
  bassRange: Readonly<{ lowMidi: number; highMidi: number }> | null;
  locks: readonly Readonly<{ voiceId: string }>[];
}>;

type CompactEvent = Readonly<{
  kind: "auto" | "fixed";
  eventId: string;
  chainBoundary: string;
  candidates: readonly CompactCandidate[];
  constraints: CompactConstraints;
}>;

type TransitionOutcome =
  | Readonly<{ kind: "cost"; cost: CostTuple }>
  | Readonly<{ kind: "refused"; lockVoiceIds: readonly string[] }>;

type ExpandedRequest = Readonly<{
  schema: string;
  requestId: string;
  sourceRevision: number;
  engineVersion: number;
  loopClosure: boolean;
  maxWorkQuanta: number;
  events: readonly CompactEvent[];
  layerOracle: (fromOrdinal: number, from: string, to: string) => TransitionOutcome;
  loopOracle: (from: string, to: string) => TransitionOutcome;
}>;

function candidateIdOf(index: number): string {
  return `candidate-${String(index).padStart(3, "0")}`;
}

function expandRequest(
  caseRequest: JsonObject,
  defaults: JsonObject,
): ExpandedRequest {
  const generator = caseRequest["generator"] as JsonObject | undefined;
  let events: CompactEvent[];
  let layerOracle: ExpandedRequest["layerOracle"];
  if (generator) {
    const eventCount = generator["eventCount"] as number;
    const candidateCount = generator["candidateCount"] as number;
    const rule = generator["costRule"] as string;
    const uniform = generator["uniformCost"] as CostTuple | undefined;
    const table = generator["costTable"] as Record<string, CostTuple> | undefined;
    const candidates: CompactCandidate[] = [];
    for (let j = 0; j < candidateCount; j += 1) {
      candidates.push({
        candidateId: candidateIdOf(j),
        family: "balanced",
        voiceMidis: [
          Math.min(127, 48 + j),
          Math.min(127, 52 + j),
          Math.min(127, 59 + j),
        ],
      });
    }
    events = [];
    for (let i = 0; i < eventCount; i += 1) {
      events.push({
        kind: "auto",
        eventId: `event-${String(i).padStart(4, "0")}`,
        chainBoundary: i === 0 ? "reset" : "continue",
        candidates,
        constraints: { families: null, range: null, bassRange: null, locks: [] },
      });
    }
    layerOracle = (_ordinal, from, to) => {
      if (rule === "uniform" && uniform) return { kind: "cost", cost: uniform };
      if (rule === "table" && table) {
        const cost = table[`${from}->${to}`];
        if (!cost) throw new Error(`missing table cost ${from}->${to}`);
        return { kind: "cost", cost };
      }
      const i = Number(from.slice(-3));
      const j = Number(to.slice(-3));
      const d = Math.abs(i - j);
      return { kind: "cost", cost: [d + 1, d + 1, 0, 0, 0, 0, 12] };
    };
  } else {
    const rawEvents = (caseRequest["events"] as JsonObject[] | undefined) ?? [];
    events = rawEvents.map((raw) => {
      const kind = raw["kind"] as "auto" | "fixed";
      const single = raw["candidate"] as CompactCandidate | undefined;
      return {
        kind,
        eventId: raw["eventId"] as string,
        chainBoundary: raw["chainBoundary"] as string,
        candidates:
          kind === "fixed" && single
            ? [single]
            : ((raw["candidates"] as CompactCandidate[] | undefined) ?? []),
        constraints: raw["constraints"] as CompactConstraints,
      };
    });
    const transitions = (caseRequest["transitions"] as JsonObject[] | undefined) ?? [];
    const map = new Map<string, TransitionOutcome>();
    for (const entry of transitions) {
      const key = `${String(entry["fromEventOrdinal"])}:${String(entry["from"])}->${String(entry["to"])}`;
      map.set(
        key,
        entry["refusal"] === undefined
          ? { kind: "cost", cost: entry["cost"] as CostTuple }
          : {
              kind: "refused",
              lockVoiceIds:
                (entry["lockConflictVoiceIds"] as string[] | undefined) ?? [],
            },
      );
    }
    layerOracle = (ordinal, from, to) => {
      const outcome = map.get(`${String(ordinal)}:${from}->${to}`);
      if (!outcome) {
        throw new Error(`missing transition ${String(ordinal)}:${from}->${to}`);
      }
      return outcome;
    };
  }
  const loops = (caseRequest["loopTransitions"] as JsonObject[] | undefined) ?? [];
  const loopMap = new Map<string, TransitionOutcome>();
  for (const entry of loops) {
    loopMap.set(
      `${String(entry["from"])}->${String(entry["to"])}`,
      entry["refusal"] === undefined
        ? { kind: "cost", cost: entry["cost"] as CostTuple }
        : {
            kind: "refused",
            lockVoiceIds:
              (entry["lockConflictVoiceIds"] as string[] | undefined) ?? [],
          },
    );
  }
  return {
    schema:
      (caseRequest["schemaOverride"] as string | undefined) ?? REQUEST_SCHEMA,
    requestId: caseRequest["requestId"] as string,
    sourceRevision:
      (caseRequest["sourceRevisionOverride"] as number | undefined) ??
      (defaults["sourceRevision"] as number),
    engineVersion:
      (caseRequest["engineVersionOverride"] as number | undefined) ?? 1,
    loopClosure:
      (caseRequest["loopClosure"] as boolean | undefined) ??
      (defaults["loopClosure"] as boolean),
    maxWorkQuanta:
      (caseRequest["maxWorkQuantaOverride"] as number | undefined) ??
      (caseRequest["maxWorkQuanta"] as number | undefined) ??
      (defaults["maxWorkQuanta"] as number),
    events,
    layerOracle,
    loopOracle: (from, to) => {
      const outcome = loopMap.get(`${from}->${to}`);
      if (!outcome) throw new Error(`missing loop transition ${from}->${to}`);
      return outcome;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Reference request validation (Section 4 precedence)                */
/* ------------------------------------------------------------------ */

type ReferenceRefusal = Readonly<{ code: string; pointer: string }>;

function validateRequest(request: ExpandedRequest): ReferenceRefusal | null {
  if (request.schema !== REQUEST_SCHEMA) {
    return { code: "progression.schema_invalid", pointer: "/schema" };
  }
  if (request.engineVersion !== 1) {
    return {
      code: "progression.policy_invalid",
      pointer: "/identity/engineVersion",
    };
  }
  if (!Number.isInteger(request.sourceRevision) || request.sourceRevision < 0) {
    return {
      code: "progression.identity_invalid",
      pointer: "/identity/sourceRevision",
    };
  }
  if (!LOCAL.requestIdPattern.test(request.requestId)) {
    return {
      code: "progression.request_id_invalid",
      pointer: "/identity/requestId",
    };
  }
  if (
    !Number.isInteger(request.maxWorkQuanta) ||
    request.maxWorkQuanta < 1 ||
    request.maxWorkQuanta > LOCAL.maxWorkQuanta
  ) {
    return {
      code: "progression.quantum_budget_invalid",
      pointer: "/maxWorkQuanta",
    };
  }
  if (request.events.length > LOCAL.requestEvents) {
    return { code: "progression.event_count_exceeded", pointer: "/events" };
  }
  if (request.events.length === 0) {
    return { code: "progression.event_invalid", pointer: "/events" };
  }
  const seenEventIds = new Set<string>();
  for (let i = 0; i < request.events.length; i += 1) {
    const event = request.events[i];
    if (!event) continue;
    const base = `/events/${String(i)}`;
    if (i === 0 && event.chainBoundary !== "reset") {
      return {
        code: "progression.event_invalid",
        pointer: `${base}/chainBoundary`,
      };
    }
    if (event.chainBoundary !== "reset" && event.chainBoundary !== "continue") {
      return {
        code: "progression.event_invalid",
        pointer: `${base}/chainBoundary`,
      };
    }
    if (seenEventIds.has(event.eventId)) {
      return { code: "progression.event_invalid", pointer: `${base}/eventId` };
    }
    seenEventIds.add(event.eventId);
    const candidates = event.candidates;
    if (event.kind === "auto") {
      if (
        candidates.length < 1 ||
        candidates.length > LOCAL.candidatesPerEvent
      ) {
        return {
          code: "progression.candidate_invalid",
          pointer: `${base}/candidates`,
        };
      }
      const ids = candidates.map((candidate) => candidate.candidateId);
      const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (
        new Set(ids).size !== ids.length ||
        JSON.stringify(ids) !== JSON.stringify(sorted)
      ) {
        return {
          code: "progression.candidate_invalid",
          pointer: `${base}/candidates`,
        };
      }
    } else if (candidates.length !== 1) {
      return {
        code: "progression.candidate_invalid",
        pointer: `${base}/candidates`,
      };
    }
    const constraints = event.constraints;
    if (constraints.families !== null) {
      const families = constraints.families;
      const valid =
        families.length > 0 &&
        new Set(families).size === families.length &&
        families.every((family) =>
          (FAMILIES as readonly string[]).includes(family),
        );
      if (!valid) {
        return {
          code: "progression.constraint_invalid",
          pointer: `${base}/constraints/families`,
        };
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
          return {
            code: "progression.constraint_invalid",
            pointer: `${base}/constraints/${key}`,
          };
        }
      }
    }
    if (constraints.locks.length > LOCAL.locksPerEvent) {
      return {
        code: "progression.constraint_invalid",
        pointer: `${base}/constraints/locks`,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Reference optimizer (Sections 5-8), unit-resumable                 */
/* ------------------------------------------------------------------ */

type ChainState = Readonly<{ path: readonly string[]; cost: CostTuple }>;

type ConstraintRef = Readonly<{
  eventId: string;
  kind: string;
  voiceId: string | null;
}>;

type Degradation = Readonly<{
  reason: string;
  segmentOrdinal: number | null;
  windowOrdinal: number | null;
  eventIds: readonly string[];
  constraintRefs: readonly ConstraintRef[];
}>;

type Conflict = Readonly<{
  segmentOrdinal: number;
  windowOrdinal: number;
  eventId: string;
  constraintRefs: readonly ConstraintRef[];
  minimality: "bounded-small";
  explicitRelaxations: readonly string[];
}>;

type WindowOutcome = Readonly<{
  segmentOrdinal: number;
  windowOrdinal: number;
  boundaryCondition: "open" | "fixed-start";
  firstEventOrdinal: number;
  lastEventOrdinal: number;
  realizations: readonly Readonly<{
    candidateIds: readonly string[];
    cost: CostTuple;
    loopClosureApplied: boolean;
  }>[];
}>;

type EngineResult = Readonly<{
  kind: "optimized" | "no-realization";
  termination: "complete" | "exhausted";
  segments: readonly WindowOutcome[];
  aggregateSelectedCost: CostTuple;
  degradations: readonly Degradation[];
  conflicts: readonly Conflict[];
}>;

function foldCost(base: CostTuple, transition: CostTuple): CostTuple {
  return COST_AGGREGATIONS.map((aggregation, i) =>
    aggregation === "sum"
      ? (base[i] ?? 0) + (transition[i] ?? 0)
      : Math.max(base[i] ?? 0, transition[i] ?? 0),
  );
}

function dominatesCost(a: CostTuple, b: CostTuple): boolean {
  let strict = false;
  for (let i = 0; i < COST_AXES.length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return false;
    if (left < right) strict = true;
  }
  return strict;
}

function compareChains(a: ChainState, b: ChainState): number {
  for (let i = 0; i < COST_AXES.length; i += 1) {
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

class Engine {
  counters: Record<WorkCounterName, number>;
  memory: Record<MemoryCounterName, number>;
  private degradations: Degradation[] = [];
  private conflicts: Conflict[] = [];
  private windows: WindowOutcome[] = [];
  private exhausted = false;
  private arenaCount = 0;
  private layerGenerated = 0;
  private realizationCount = 0;
  private currentSegment = 0;
  private currentWindow = 0;

  constructor(private readonly request: ExpandedRequest) {
    this.counters = Object.fromEntries(
      WORK_COUNTERS.map((name) => [name, 0]),
    ) as Record<WorkCounterName, number>;
    this.memory = Object.fromEntries(
      MEMORY_COUNTERS.map((name) => [name, 0]),
    ) as Record<MemoryCounterName, number>;
  }

  private trackGenerated(): void {
    this.layerGenerated += 1;
    this.memory.peakLayerGeneratedStates = Math.max(
      this.memory.peakLayerGeneratedStates,
      this.layerGenerated,
    );
    this.memory.peakTrackedStates = Math.max(
      this.memory.peakTrackedStates,
      this.arenaCount + this.layerGenerated,
    );
  }

  private retainFrontier(frontier: readonly ChainState[]): void {
    this.arenaCount += frontier.length;
    this.layerGenerated = 0;
    this.memory.peakFrontierStates = Math.max(
      this.memory.peakFrontierStates,
      frontier.length,
    );
  }

  private filterCandidates(event: CompactEvent): Readonly<{
    survivors: readonly CompactCandidate[];
    failedKinds: readonly string[];
  }> {
    const constraints = event.constraints;
    if (event.kind === "fixed") {
      const candidate = event.candidates[0];
      const violated: string[] = [];
      if (candidate) {
        if (
          constraints.families !== null &&
          !constraints.families.includes(candidate.family)
        ) {
          violated.push("families");
        }
        const range = constraints.range;
        if (
          range !== null &&
          !candidate.voiceMidis.every(
            (midi) => midi >= range.lowMidi && midi <= range.highMidi,
          )
        ) {
          violated.push("range");
        }
        const bassRange = constraints.bassRange;
        const bass = candidate.voiceMidis[0] ?? 0;
        if (
          bassRange !== null &&
          (bass < bassRange.lowMidi || bass > bassRange.highMidi)
        ) {
          violated.push("bassRange");
        }
      }
      if (violated.length > 0) {
        this.degradations.push({
          reason: "fixed-candidate-constraint-conflict",
          segmentOrdinal: this.currentSegment,
          windowOrdinal: this.currentWindow,
          eventIds: [event.eventId],
          constraintRefs: violated.map((kind) => ({
            eventId: event.eventId,
            kind,
            voiceId: null,
          })),
        });
      }
      return { survivors: event.candidates, failedKinds: [] };
    }
    const survivors: CompactCandidate[] = [];
    const failedKinds: string[] = [];
    for (const candidate of event.candidates) {
      let failed: string | null = null;
      if (
        constraints.families !== null &&
        !constraints.families.includes(candidate.family)
      ) {
        failed = "families";
      } else {
        const range = constraints.range;
        if (
          range !== null &&
          !candidate.voiceMidis.every(
            (midi) => midi >= range.lowMidi && midi <= range.highMidi,
          )
        ) {
          failed = "range";
        } else {
          const bassRange = constraints.bassRange;
          const bass = candidate.voiceMidis[0] ?? 0;
          if (
            bassRange !== null &&
            (bass < bassRange.lowMidi || bass > bassRange.highMidi)
          ) {
            failed = "bassRange";
          }
        }
      }
      if (failed === null) survivors.push(candidate);
      else {
        this.counters.constraintFilteredCandidates += 1;
        if (!failedKinds.includes(failed)) failedKinds.push(failed);
      }
    }
    failedKinds.sort(
      (a, b) =>
        CONSTRAINT_KIND_ORDER.indexOf(a as (typeof CONSTRAINT_KIND_ORDER)[number]) -
        CONSTRAINT_KIND_ORDER.indexOf(b as (typeof CONSTRAINT_KIND_ORDER)[number]),
    );
    return { survivors, failedKinds };
  }

  /** One yield per consumed work unit; the unit's work precedes its yield. */
  *run(): Generator<void, EngineResult> {
    const request = this.request;
    const segments: CompactEvent[][] = [];
    const segmentStarts: number[] = [];
    for (let i = 0; i < request.events.length; i += 1) {
      const event = request.events[i];
      if (!event) continue;
      if (event.chainBoundary === "reset" || segments.length === 0) {
        segments.push([]);
        segmentStarts.push(i);
      }
      segments[segments.length - 1]?.push(event);
    }
    const singleChain =
      segments.length === 1 &&
      (segments[0]?.length ?? 0) <= LOCAL.windowEvents;
    let loopRequested = request.loopClosure;
    if (loopRequested && !singleChain) {
      this.degradations.push({
        reason: "loop-closure-skipped",
        segmentOrdinal: null,
        windowOrdinal: null,
        eventIds: [],
        constraintRefs: [],
      });
      loopRequested = false;
    }
    let anyConflict = false;
    for (
      let segmentOrdinal = 0;
      segmentOrdinal < segments.length;
      segmentOrdinal += 1
    ) {
      const segmentEvents = segments[segmentOrdinal] ?? [];
      const segmentStart = segmentStarts[segmentOrdinal] ?? 0;
      this.currentSegment = segmentOrdinal;
      const windowCount = Math.ceil(segmentEvents.length / LOCAL.windowEvents);
      if (windowCount > 1) {
        const boundaryIds: string[] = [];
        for (let w = 1; w < windowCount; w += 1) {
          boundaryIds.push(
            segmentEvents[w * LOCAL.windowEvents]?.eventId ?? "",
          );
        }
        this.degradations.push({
          reason: "window-partition",
          segmentOrdinal,
          windowOrdinal: null,
          eventIds: boundaryIds,
          constraintRefs: [],
        });
        this.exhausted = true;
      }
      let boundary: CompactCandidate | null = null;
      let segmentDead = false;
      for (
        let windowOrdinal = 0;
        windowOrdinal < windowCount && !segmentDead;
        windowOrdinal += 1
      ) {
        this.currentWindow = windowOrdinal;
        const windowEvents = segmentEvents.slice(
          windowOrdinal * LOCAL.windowEvents,
          (windowOrdinal + 1) * LOCAL.windowEvents,
        );
        const firstOrdinal = segmentStart + windowOrdinal * LOCAL.windowEvents;
        this.arenaCount = 0;
        this.layerGenerated = 0;
        const evictionEventIds: string[] = [];
        let frontier: ChainState[] = [];
        let dead: Conflict | null = null;
        const zero: CostTuple = COST_AXES.map(() => 0);
        const fixedStart = boundary !== null;
        if (boundary !== null) {
          this.counters.workUnits += 1;
          this.counters.seededStates += 1;
          this.counters.generatedStates += 1;
          this.trackGenerated();
          yield;
          frontier = [{ path: [], cost: zero }];
          this.retainFrontier(frontier);
        } else {
          const first = windowEvents[0];
          if (!first) continue;
          const { survivors, failedKinds } = this.filterCandidates(first);
          if (survivors.length === 0) {
            dead = {
              segmentOrdinal,
              windowOrdinal,
              eventId: first.eventId,
              constraintRefs: failedKinds.map((kind) => ({
                eventId: first.eventId,
                kind,
                voiceId: null,
              })),
              minimality: "bounded-small",
              explicitRelaxations: [],
            };
          } else {
            for (const candidate of survivors) {
              this.counters.workUnits += 1;
              this.counters.seededStates += 1;
              this.counters.generatedStates += 1;
              this.trackGenerated();
              frontier.push({ path: [candidate.candidateId], cost: zero });
              yield;
            }
            frontier.sort(compareChains);
            this.retainFrontier(frontier);
          }
        }
        const layerStart = fixedStart ? 0 : 1;
        for (
          let k = layerStart;
          k < windowEvents.length && dead === null;
          k += 1
        ) {
          const target = windowEvents[k];
          if (!target) continue;
          const layerOrdinal = firstOrdinal + k - 1;
          const { survivors, failedKinds } = this.filterCandidates(target);
          if (target.kind === "auto" && survivors.length === 0) {
            dead = {
              segmentOrdinal,
              windowOrdinal,
              eventId: target.eventId,
              constraintRefs: failedKinds.map((kind) => ({
                eventId: target.eventId,
                kind,
                voiceId: null,
              })),
              minimality: "bounded-small",
              explicitRelaxations: [],
            };
            break;
          }
          const memo = new Map<string, TransitionOutcome>();
          const buckets = new Map<string, ChainState[]>();
          const refusalLockIds = new Set<string>();
          const loopBuckets = loopRequested && windowCount === 1;
          let sawPlainRefusal = false;
          for (const state of frontier) {
            const fromId =
              fixedStart && state.path.length === 0
                ? (boundary?.candidateId ?? "")
                : (state.path[state.path.length - 1] ?? "");
            for (const candidate of survivors) {
              this.counters.workUnits += 1;
              this.counters.statePairExpansions += 1;
              const memoKey = `${fromId}->${candidate.candidateId}`;
              let outcome = memo.get(memoKey);
              if (!outcome) {
                outcome = request.layerOracle(
                  layerOrdinal,
                  fromId,
                  candidate.candidateId,
                );
                memo.set(memoKey, outcome);
                this.counters.oracleTransitionCalls += 1;
                if (outcome.kind === "refused") {
                  this.counters.oracleRefusedTransitions += 1;
                  if (outcome.lockVoiceIds.length === 0) sawPlainRefusal = true;
                  for (const voiceId of outcome.lockVoiceIds) {
                    refusalLockIds.add(voiceId);
                  }
                }
              }
              if (outcome.kind === "cost") {
                this.counters.generatedStates += 1;
                this.trackGenerated();
                const next: ChainState = {
                  path: [...state.path, candidate.candidateId],
                  cost: foldCost(state.cost, outcome.cost),
                };
                const bucketKey = loopBuckets
                  ? `${next.path[0] ?? ""}|${candidate.candidateId}`
                  : candidate.candidateId;
                const bucket = buckets.get(bucketKey) ?? [];
                bucket.push(next);
                buckets.set(bucketKey, bucket);
              }
              yield;
            }
          }
          const retainedPerBucket: ChainState[] = [];
          for (const id of [...buckets.keys()].sort()) {
            const bucket = buckets.get(id) ?? [];
            for (const state of bucket) {
              const dominated = bucket.some(
                (other) => other !== state && dominatesCost(other.cost, state.cost),
              );
              if (dominated) this.counters.dominancePrunes += 1;
              else retainedPerBucket.push(state);
            }
          }
          retainedPerBucket.sort(compareChains);
          let retained = retainedPerBucket;
          if (retained.length > LOCAL.beamWidth) {
            this.counters.beamEvictions += retained.length - LOCAL.beamWidth;
            retained = retained.slice(0, LOCAL.beamWidth);
            this.exhausted = true;
            if (!evictionEventIds.includes(target.eventId)) {
              evictionEventIds.push(target.eventId);
            }
          }
          if (retained.length === 0) {
            const refs: ConstraintRef[] = [];
            for (const voiceId of [...refusalLockIds].sort()) {
              refs.push({ eventId: target.eventId, kind: "lock", voiceId });
            }
            if (sawPlainRefusal && refs.length === 0) {
              refs.push({
                eventId: target.eventId,
                kind: "transition-no-assignment",
                voiceId: null,
              });
            }
            dead = {
              segmentOrdinal,
              windowOrdinal,
              eventId: target.eventId,
              constraintRefs: refs,
              minimality: "bounded-small",
              explicitRelaxations: [],
            };
            break;
          }
          frontier = retained;
          this.retainFrontier(frontier);
        }
        if (evictionEventIds.length > 0) {
          this.degradations.push({
            reason: "beam-eviction",
            segmentOrdinal,
            windowOrdinal,
            eventIds: evictionEventIds,
            constraintRefs: [],
          });
        }
        if (dead !== null) {
          this.conflicts.push(dead);
          anyConflict = true;
          segmentDead = true;
          this.counters.windowsOptimized += 1;
          continue;
        }
        let loopApplied = false;
        if (loopRequested && windowCount === 1) {
          const closed: ChainState[] = [];
          const loopMemo = new Map<string, TransitionOutcome>();
          for (const state of frontier) {
            this.counters.workUnits += 1;
            this.counters.loopClosureUnits += 1;
            const fromId = state.path[state.path.length - 1] ?? "";
            const toId = state.path[0] ?? "";
            const memoKey = `${fromId}->${toId}`;
            let outcome = loopMemo.get(memoKey);
            if (!outcome) {
              outcome = request.loopOracle(fromId, toId);
              loopMemo.set(memoKey, outcome);
              this.counters.oracleTransitionCalls += 1;
            }
            if (outcome.kind === "refused") {
              this.counters.loopClosureRefusals += 1;
            } else {
              closed.push({
                path: state.path,
                cost: foldCost(state.cost, outcome.cost),
              });
            }
            yield;
          }
          if (closed.length === 0) {
            const first = windowEvents[0];
            this.conflicts.push({
              segmentOrdinal,
              windowOrdinal,
              eventId: first?.eventId ?? "",
              constraintRefs: [
                {
                  eventId: first?.eventId ?? "",
                  kind: "loop-closure",
                  voiceId: null,
                },
              ],
              minimality: "bounded-small",
              explicitRelaxations: [],
            });
            anyConflict = true;
            segmentDead = true;
            this.counters.windowsOptimized += 1;
            continue;
          }
          frontier = closed;
          loopApplied = true;
        }
        const front = frontier.filter(
          (state) =>
            !frontier.some(
              (other) =>
                other !== state && dominatesCost(other.cost, state.cost),
            ),
        );
        front.sort(compareChains);
        this.windows.push({
          segmentOrdinal,
          windowOrdinal,
          boundaryCondition: fixedStart ? "fixed-start" : "open",
          firstEventOrdinal: firstOrdinal,
          lastEventOrdinal: firstOrdinal + windowEvents.length - 1,
          realizations: front.map((state) => ({
            candidateIds: state.path,
            cost: state.cost,
            loopClosureApplied: loopApplied,
          })),
        });
        this.realizationCount += front.length;
        this.memory.peakRealizationRecords = this.realizationCount;
        this.counters.windowsOptimized += 1;
        const selected = front[0];
        if (selected && windowOrdinal < windowCount - 1) {
          const lastEvent = windowEvents[windowEvents.length - 1];
          const lastId = selected.path[selected.path.length - 1] ?? "";
          boundary =
            lastEvent?.candidates.find(
              (candidate) => candidate.candidateId === lastId,
            ) ?? null;
        } else {
          boundary = null;
        }
      }
      this.counters.segmentsOptimized += 1;
    }
    let aggregate: CostTuple = COST_AXES.map(() => 0);
    for (const window of this.windows) {
      const selected = window.realizations[0];
      if (selected) aggregate = foldCost(aggregate, selected.cost);
    }
    return {
      kind: anyConflict ? "no-realization" : "optimized",
      termination: this.exhausted ? "exhausted" : "complete",
      segments: this.windows,
      aggregateSelectedCost: aggregate,
      degradations: this.degradations,
      conflicts: this.conflicts,
    };
  }
}

type BudgetedRun = Readonly<{
  engine: Engine;
  result: EngineResult | null;
  finished: boolean;
}>;

/**
 * Budget-aware stepped run: each quantum consumes up to 1,152 units; a
 * search whose work runs out mid-quantum terminates inside that quantum.
 */
function runEngineBudgeted(request: ExpandedRequest): BudgetedRun {
  const engine = new Engine(request);
  const iterator = engine.run();
  let result: EngineResult | null = null;
  let finished = false;
  let quanta = 0;
  while (!finished && quanta < request.maxWorkQuanta) {
    quanta += 1;
    let consumed = 0;
    while (consumed < LOCAL.quantumUnits) {
      const next = iterator.next();
      if (next.done === true) {
        result = next.value;
        finished = true;
        break;
      }
      consumed += 1;
      if (engine.counters.workUnits > LOCAL.totalWorkUnits) {
        throw new Error("work-limit failsafe exceeded");
      }
    }
  }
  engine.counters.workQuanta = quanta;
  return { engine, result, finished };
}

/** Straight-line run; quanta derived as floor(units / quantum) + 1. */
function runEngineUnstepped(request: ExpandedRequest): BudgetedRun {
  const engine = new Engine(request);
  const iterator = engine.run();
  let next = iterator.next();
  while (next.done !== true) {
    if (engine.counters.workUnits > LOCAL.totalWorkUnits) {
      throw new Error("work-limit failsafe exceeded");
    }
    next = iterator.next();
  }
  engine.counters.workQuanta =
    Math.floor(engine.counters.workUnits / LOCAL.quantumUnits) + 1;
  return { engine, result: next.value, finished: true };
}

/* ------------------------------------------------------------------ */
/* Brute force                                                        */
/* ------------------------------------------------------------------ */

type BruteFronts = Readonly<{
  fronts: readonly (readonly ChainState[])[];
}>;

function bruteForce(request: ExpandedRequest): BruteFronts | null {
  const zero: CostTuple = COST_AXES.map(() => 0);
  const segments: { events: CompactEvent[]; start: number }[] = [];
  for (let i = 0; i < request.events.length; i += 1) {
    const event = request.events[i];
    if (!event) continue;
    if (event.chainBoundary === "reset" || segments.length === 0) {
      segments.push({ events: [], start: i });
    }
    segments[segments.length - 1]?.events.push(event);
  }
  const singleChain =
    segments.length === 1 &&
    (segments[0]?.events.length ?? 0) <= LOCAL.windowEvents;
  const fronts: (readonly ChainState[])[] = [];
  for (const segment of segments) {
    if (segment.events.length > LOCAL.windowEvents) return null;
    const survivorLists = segment.events.map((event) => {
      if (event.kind === "fixed") return [...event.candidates];
      return event.candidates.filter((candidate) => {
        const constraints = event.constraints;
        if (
          constraints.families !== null &&
          !constraints.families.includes(candidate.family)
        ) {
          return false;
        }
        const range = constraints.range;
        if (
          range !== null &&
          !candidate.voiceMidis.every(
            (midi) => midi >= range.lowMidi && midi <= range.highMidi,
          )
        ) {
          return false;
        }
        const bassRange = constraints.bassRange;
        const bass = candidate.voiceMidis[0] ?? 0;
        if (
          bassRange !== null &&
          (bass < bassRange.lowMidi || bass > bassRange.highMidi)
        ) {
          return false;
        }
        return true;
      });
    });
    let total = 1;
    for (const list of survivorLists) total *= list.length;
    if (total > 100_000) return null;
    let chains: ChainState[] = [{ path: [], cost: zero }];
    for (let k = 0; k < survivorLists.length; k += 1) {
      const nextChains: ChainState[] = [];
      for (const chain of chains) {
        for (const candidate of survivorLists[k] ?? []) {
          if (k === 0) {
            nextChains.push({ path: [candidate.candidateId], cost: zero });
            continue;
          }
          const fromId = chain.path[chain.path.length - 1] ?? "";
          const outcome = request.layerOracle(
            segment.start + k - 1,
            fromId,
            candidate.candidateId,
          );
          if (outcome.kind === "refused") continue;
          nextChains.push({
            path: [...chain.path, candidate.candidateId],
            cost: foldCost(chain.cost, outcome.cost),
          });
        }
      }
      chains = nextChains;
    }
    if (request.loopClosure && singleChain) {
      chains = chains.flatMap((chain) => {
        const outcome = request.loopOracle(
          chain.path[chain.path.length - 1] ?? "",
          chain.path[0] ?? "",
        );
        if (outcome.kind === "refused") return [];
        return [{ path: chain.path, cost: foldCost(chain.cost, outcome.cost) }];
      });
    }
    const front = chains.filter(
      (chain) =>
        !chains.some(
          (other) => other !== chain && dominatesCost(other.cost, chain.cost),
        ),
    );
    front.sort(compareChains);
    fronts.push(front);
  }
  return { fronts };
}

/* ------------------------------------------------------------------ */
/* Expected-value helpers                                             */
/* ------------------------------------------------------------------ */

function expandRealizationPattern(pattern: JsonObject): readonly JsonObject[] {
  const kind = pattern["patternKind"] as string;
  const cost = pattern["cost"] as CostTuple;
  if (kind === "stay-chains") {
    const count = pattern["count"] as number;
    const length = pattern["length"] as number;
    const list: JsonObject[] = [];
    for (let k = 0; k < count; k += 1) {
      list.push({
        candidateIds: Array.from({ length }, () => candidateIdOf(k)),
        cost,
        loopClosureApplied: false,
      });
    }
    return list;
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
    const list: JsonObject[] = [];
    const sequence = new Array<number>(length).fill(0);
    for (let n = 0; n < count; n += 1) {
      list.push({
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
    return list;
  }
  throw new Error(`unknown realization pattern ${kind}`);
}

/* ------------------------------------------------------------------ */
/* Validation passes                                                  */
/* ------------------------------------------------------------------ */

type Fixtures = Map<string, JsonObject>;
type CaseEntry = Readonly<{
  file: string;
  index: number;
  record: JsonObject;
  defaults: JsonObject;
}>;

function checkManifest(fixtures: Fixtures, findings: Findings): void {
  const manifest = fixtures.get("v2-progression-optimizer-contract.json");
  if (!manifest) return;
  const path = "v2-progression-optimizer-contract.json";
  const limits = manifest["limits"] as JsonObject | undefined;
  const expectations: readonly (readonly [string, unknown])[] = [
    ["maxCandidatesPerEvent", LOCAL.candidatesPerEvent],
    ["beamWidth", LOCAL.beamWidth],
    ["maxWindowEvents", LOCAL.windowEvents],
    ["maxRequestEvents", LOCAL.requestEvents],
    ["maxWindowsPerSegment", LOCAL.windowsPerSegment],
    ["maxSegments", LOCAL.segments],
    ["maxLocksPerEvent", LOCAL.locksPerEvent],
    ["maxRequestIdAsciiLength", 128],
    ["workQuantumUnits", LOCAL.quantumUnits],
    ["maxWorkQuanta", LOCAL.maxWorkQuanta],
    ["maxTotalWorkUnits", LOCAL.totalWorkUnits],
    ["maxLayerGeneratedStates", LOCAL.layerGeneratedStates],
    ["maxRetainedStates", LOCAL.retainedStates],
    ["maxTrackedStates", LOCAL.trackedStates],
    ["maxOracleCallsPerLayer", LOCAL.oracleCallsPerLayer],
    ["maxOracleTransitionCalls", LOCAL.oracleTransitionCalls],
    ["maxAlternatives", LOCAL.alternatives],
    ["maxRealizationRecords", LOCAL.realizationRecords],
    ["maxChainTransitions", LOCAL.chainTransitions],
    ["maxCostTransitions", LOCAL.costTransitions],
  ];
  for (const [key, value] of expectations) {
    findings.equal(
      "V2_MANIFEST",
      `${path}#/limits/${key}`,
      limits?.[key],
      value,
      key,
    );
  }
  findings.equal(
    "V2_MANIFEST",
    `${path}#/costAxes`,
    manifest["costAxes"],
    COST_AXES,
    "cost axes",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/costAggregations`,
    COST_AXES.map(
      (axis) => (manifest["costAggregations"] as JsonObject | undefined)?.[axis],
    ),
    COST_AGGREGATIONS,
    "cost aggregations",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/costValueLimits`,
    COST_AXES.map(
      (axis) => (manifest["costValueLimits"] as JsonObject | undefined)?.[axis],
    ),
    COST_VALUE_LIMITS,
    "cost value limits",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/refusalCodes`,
    manifest["refusalCodes"],
    REFUSAL_CODES,
    "refusal codes",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/workCounterNames`,
    manifest["workCounterNames"],
    WORK_COUNTERS,
    "work counter names",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/memoryCounterNames`,
    manifest["memoryCounterNames"],
    MEMORY_COUNTERS,
    "memory counter names",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/terminations`,
    manifest["terminations"],
    TERMINATIONS,
    "terminations",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/cancelReasons`,
    manifest["cancelReasons"],
    CANCEL_REASONS,
    "cancel reasons",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/degradationReasons`,
    manifest["degradationReasons"],
    DEGRADATION_REASONS,
    "degradation reasons",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/degradationCode`,
    manifest["degradationCode"],
    "voicing.optimization_degraded",
    "degradation code",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/workUnitIdentity`,
    manifest["workUnitIdentity"],
    WORK_UNIT_IDENTITY,
    "work-unit identity",
  );
  findings.equal(
    "V2_MANIFEST",
    `${path}#/declaredFiles`,
    manifest["declaredFiles"],
    V2_FIXTURE_FILES,
    "declared files",
  );
  const precedence = manifest["validationPrecedence"] as JsonObject | undefined;
  findings.equal(
    "V2_MANIFEST",
    `${path}#/validationPrecedence/order`,
    precedence?.["order"],
    REFUSAL_CODES.slice(0, 9),
    "validation precedence",
  );
}

function collectCases(fixtures: Fixtures): Map<string, CaseEntry> {
  const cases = new Map<string, CaseEntry>();
  for (const file of [
    "optimization-cases.json",
    "boundary-cases.json",
    "limit-cases.json",
    "stepper-cases.json",
  ]) {
    const fixture = fixtures.get(file);
    if (!fixture) continue;
    const defaults = (fixture["requestDefaults"] as JsonObject | undefined) ?? {};
    const list = (fixture["cases"] as JsonObject[] | undefined) ?? [];
    list.forEach((record, index) => {
      cases.set(record["id"] as string, { file, index, record, defaults });
    });
  }
  return cases;
}

function compareCounters(
  findings: Findings,
  path: string,
  engine: Engine,
  expectedCounters: JsonObject | undefined,
  expectedMemory: JsonObject | undefined,
): void {
  if (expectedCounters) {
    for (const name of WORK_COUNTERS) {
      findings.equal(
        "V2_COUNTER",
        `${path}/counters/${name}`,
        engine.counters[name],
        expectedCounters[name],
        `counter ${name}`,
      );
    }
    const identity =
      engine.counters.seededStates +
      engine.counters.statePairExpansions +
      engine.counters.loopClosureUnits;
    if (engine.counters.workUnits !== identity) {
      findings.add(
        "V2_COUNTER",
        `${path}/counters/workUnits`,
        "work-unit identity violated",
      );
    }
  }
  if (expectedMemory) {
    for (const name of MEMORY_COUNTERS) {
      findings.equal(
        "V2_COUNTER",
        `${path}/memory/${name}`,
        engine.memory[name],
        expectedMemory[name],
        `memory ${name}`,
      );
    }
  }
}

function checkOptimizeCase(
  findings: Findings,
  path: string,
  record: JsonObject,
  defaults: JsonObject,
): void {
  const request = expandRequest(record["request"] as JsonObject, defaults);
  const expected = record["expected"] as JsonObject;
  const refusal = validateRequest(request);
  const expectedRefusal = expected["refusal"] as JsonObject | undefined;
  if (record["kind"] === "refuse") {
    if (!refusal) {
      findings.add("V2_REFUSAL", path, "expected a refusal, request validated");
      return;
    }
    findings.equal(
      "V2_REFUSAL",
      `${path}/refusal/code`,
      refusal.code,
      expectedRefusal?.["code"],
      "refusal code",
    );
    findings.equal(
      "V2_REFUSAL",
      `${path}/refusal/pointer`,
      refusal.pointer,
      expectedRefusal?.["pointer"],
      "refusal pointer",
    );
    return;
  }
  if (refusal) {
    findings.add(
      "V2_CASE",
      path,
      `request unexpectedly refused: ${refusal.code} at ${refusal.pointer}`,
    );
    return;
  }
  const budgeted = runEngineBudgeted(request);
  if (!budgeted.finished) {
    findings.equal(
      "V2_EXPECTATION",
      `${path}/kind`,
      "unfinished",
      expected["kind"],
      "outcome kind",
    );
    findings.equal(
      "V2_EXPECTATION",
      `${path}/termination`,
      "work-quanta-cap",
      expected["termination"],
      "termination",
    );
    compareCounters(
      findings,
      path,
      budgeted.engine,
      expected["counters"] as JsonObject | undefined,
      expected["memory"] as JsonObject | undefined,
    );
    return;
  }
  const engine = budgeted.engine;
  const result = budgeted.result;
  if (!result) {
    findings.add("V2_CASE", path, "engine finished without a result");
    return;
  }
  findings.equal(
    "V2_EXPECTATION",
    `${path}/kind`,
    result.kind,
    expected["kind"],
    "outcome kind",
  );
  findings.equal(
    "V2_EXPECTATION",
    `${path}/termination`,
    result.termination,
    expected["termination"],
    "termination",
  );
  const expectedSegments = (expected["segments"] as JsonObject[] | undefined) ?? [];
  if (result.kind === "optimized") {
    if (expectedSegments.length !== result.segments.length) {
      findings.add(
        "V2_REALIZATION",
        `${path}/segments`,
        `expected ${String(expectedSegments.length)} segment windows, recomputed ${String(result.segments.length)}`,
      );
    }
    const paired = Math.min(expectedSegments.length, result.segments.length);
    for (let i = 0; i < paired; i += 1) {
      const expectedSegment = expectedSegments[i];
      const actualSegment = result.segments[i];
      if (!expectedSegment || !actualSegment) continue;
      const segmentPath = `${path}/segments/${String(i)}`;
      for (const key of [
        "segmentOrdinal",
        "windowOrdinal",
        "boundaryCondition",
        "firstEventOrdinal",
        "lastEventOrdinal",
      ] as const) {
        if (key in expectedSegment) {
          findings.equal(
            "V2_EXPECTATION",
            `${segmentPath}/${key}`,
            (actualSegment as unknown as JsonObject)[key],
            expectedSegment[key],
            key,
          );
        }
      }
      const pattern = expectedSegment["realizationPattern"] as
        | JsonObject
        | undefined;
      const expectedRealizations = pattern
        ? expandRealizationPattern(pattern)
        : ((expectedSegment["realizations"] as JsonObject[] | undefined) ?? []);
      findings.equal(
        "V2_REALIZATION",
        `${segmentPath}/realizations`,
        actualSegment.realizations,
        expectedRealizations,
        "realizations",
      );
    }
    findings.equal(
      "V2_EXPECTATION",
      `${path}/aggregateSelectedCost`,
      result.aggregateSelectedCost,
      expected["aggregateSelectedCost"],
      "aggregate selected cost",
    );
  }
  findings.equal(
    "V2_DEGRADATION",
    `${path}/degradations`,
    result.degradations,
    expected["degradations"] ?? [],
    "degradations",
  );
  findings.equal(
    "V2_CONFLICT",
    `${path}/conflicts`,
    result.conflicts,
    expected["conflicts"] ?? [],
    "conflicts",
  );
  compareCounters(
    findings,
    path,
    engine,
    expected["counters"] as JsonObject | undefined,
    expected["memory"] as JsonObject | undefined,
  );
  if (record["bruteForceCertified"] === true) {
    const brute = bruteForce(request);
    if (!brute) {
      findings.add(
        "V2_CASE",
        path,
        "bruteForceCertified case exceeds brute-force bounds",
      );
    } else if (result.kind === "optimized") {
      const referenceFronts = result.segments.map((window) =>
        window.realizations.map((realization) => ({
          path: realization.candidateIds,
          cost: realization.cost,
        })),
      );
      findings.equal(
        "V2_REALIZATION",
        `${path}/bruteForce`,
        referenceFronts,
        brute.fronts,
        "brute-force front equality",
      );
    } else if (!brute.fronts.some((front) => front.length === 0)) {
      findings.add(
        "V2_REALIZATION",
        `${path}/bruteForce`,
        "no-realization not confirmed by brute force",
      );
    }
  }
}

function checkStepperCase(
  findings: Findings,
  path: string,
  record: JsonObject,
  cases: Map<string, CaseEntry>,
): void {
  const baseId = record["baseCaseId"] as string;
  const base = cases.get(baseId);
  if (!base) {
    findings.add("V2_STEPPER", path, `unknown baseCaseId ${baseId}`);
    return;
  }
  const request = expandRequest(base.record["request"] as JsonObject, base.defaults);
  const expected = record["expected"] as JsonObject;
  if (record["kind"] === "yield-equivalence") {
    const stepped = runEngineBudgeted(request);
    const straight = runEngineUnstepped(request);
    findings.equal(
      "V2_STEPPER",
      `${path}/equivalence`,
      {
        result: stepped.result,
        counters: stepped.engine.counters,
        memory: stepped.engine.memory,
      },
      {
        result: straight.result,
        counters: straight.engine.counters,
        memory: straight.engine.memory,
      },
      "stepped vs unstepped outcome",
    );
    return;
  }
  const script = (record["script"] as string[] | undefined) ?? [];
  let engine: Engine | null = null;
  let iterator: Generator<void, EngineResult> | null = null;
  let status: "running" | "terminal" = "running";
  let quantaConsumed = 0;
  let outcomeKind: string | null = null;
  let termination: string | null = null;
  let cancelReason: string | null = null;
  let tampered = false;
  const trajectory: JsonObject[] = [];
  let finalRefusal: ReferenceRefusal | null = null;
  let advanceOrdinal = 0;
  for (const op of script) {
    if (op === "initialize") {
      const refusal = validateRequest(request);
      if (refusal) {
        finalRefusal = refusal;
        break;
      }
      engine = new Engine(request);
      iterator = engine.run();
      status = "running";
      continue;
    }
    if (op === "tamper-continuation-tag") {
      tampered = true;
      continue;
    }
    if (op === "advance" || op === "advance-until-terminal") {
      if (tampered) {
        finalRefusal = {
          code: "progression.resume_stale",
          pointer: "/continuation/engineVersionTag",
        };
        break;
      }
      if (status === "terminal") {
        finalRefusal = { code: "progression.resume_invalid", pointer: "/status" };
        break;
      }
      if (!iterator || !engine) break;
      const rounds = op === "advance" ? 1 : Number.MAX_SAFE_INTEGER;
      for (let round = 0; round < rounds && status === "running"; round += 1) {
        advanceOrdinal += 1;
        let consumed = 0;
        while (consumed < LOCAL.quantumUnits) {
          const next = iterator.next();
          if (next.done === true) {
            outcomeKind = next.value.kind;
            termination = next.value.termination;
            status = "terminal";
            break;
          }
          consumed += 1;
        }
        quantaConsumed += 1;
        engine.counters.workQuanta = quantaConsumed;
        if (status === "running" && quantaConsumed >= request.maxWorkQuanta) {
          status = "terminal";
          outcomeKind = "unfinished";
          termination = "work-quanta-cap";
        }
        trajectory.push({
          afterOperation: advanceOrdinal,
          status,
          quantaConsumed,
          workUnits: engine.counters.workUnits,
          outcomeKind,
          termination,
        });
      }
      continue;
    }
    if (op.startsWith("cancel:")) {
      if (status === "terminal") {
        finalRefusal = { code: "progression.resume_invalid", pointer: "/status" };
        break;
      }
      cancelReason = op.slice("cancel:".length);
      status = "terminal";
      outcomeKind = "cancelled";
      termination = "cancelled";
      continue;
    }
    findings.add("V2_STEPPER", path, `unknown stepper operation ${op}`);
    return;
  }
  const expectedRefusal = expected["finalRefusal"] as JsonObject | undefined;
  if (expectedRefusal) {
    if (!finalRefusal) {
      findings.add(
        "V2_STEPPER",
        `${path}/finalRefusal`,
        "expected a refusal, none produced",
      );
    } else {
      findings.equal(
        "V2_STEPPER",
        `${path}/finalRefusal/code`,
        finalRefusal.code,
        expectedRefusal["code"],
        "refusal code",
      );
      findings.equal(
        "V2_STEPPER",
        `${path}/finalRefusal/pointer`,
        finalRefusal.pointer,
        expectedRefusal["pointer"],
        "refusal pointer",
      );
    }
  } else if (finalRefusal) {
    findings.add(
      "V2_STEPPER",
      `${path}/finalRefusal`,
      `unexpected refusal ${finalRefusal.code} at ${finalRefusal.pointer}`,
    );
  }
  const expectedTrajectory = expected["trajectory"] as JsonObject[] | undefined;
  if (expectedTrajectory) {
    for (const entry of expectedTrajectory) {
      const ordinal = entry["afterOperation"] as number;
      const actual = trajectory.find((row) => row["afterOperation"] === ordinal);
      if (!actual) {
        findings.add(
          "V2_STEPPER",
          `${path}/trajectory`,
          `no snapshot after advance ${String(ordinal)}`,
        );
        continue;
      }
      for (const key of [
        "status",
        "quantaConsumed",
        "workUnits",
        "outcomeKind",
        "termination",
      ]) {
        if (key in entry) {
          findings.equal(
            "V2_STEPPER",
            `${path}/trajectory/${String(ordinal)}/${key}`,
            actual[key],
            entry[key],
            key,
          );
        }
      }
    }
  }
  const expectedFinal = expected["final"] as JsonObject | undefined;
  if (expectedFinal && !finalRefusal) {
    const observed: JsonObject = {
      status,
      quantaConsumed,
      workUnits: engine?.counters.workUnits ?? 0,
      outcomeKind,
      termination,
      cancelReason,
      realizationRecords: engine?.memory.peakRealizationRecords ?? 0,
      countersAllZero: engine
        ? WORK_COUNTERS.every((name) => engine.counters[name] === 0)
        : true,
    };
    for (const key of Object.keys(expectedFinal)) {
      findings.equal(
        "V2_STEPPER",
        `${path}/final/${key}`,
        observed[key],
        expectedFinal[key],
        key,
      );
    }
  }
}

function checkTraces(
  findings: Findings,
  fixtures: Fixtures,
  cases: Map<string, CaseEntry>,
): void {
  const ledger = fixtures.get("trace-ledger.json");
  const controls = fixtures.get("mutation-controls.json");
  if (!ledger || !controls) return;
  const traces = (ledger["traces"] as JsonObject[] | undefined) ?? [];
  const controlIds = new Set(
    ((controls["controls"] as JsonObject[] | undefined) ?? []).map(
      (control) => control["id"] as string,
    ),
  );
  const caseToTraces = new Map<string, Set<string>>();
  for (const [caseId, entry] of cases) {
    caseToTraces.set(
      caseId,
      new Set((entry.record["traceIds"] as string[] | undefined) ?? []),
    );
  }
  const coveredCases = new Set<string>();
  const coveredControls = new Set<string>();
  for (const trace of traces) {
    const traceId = trace["id"] as string;
    const caseIds = (trace["caseIds"] as string[] | undefined) ?? [];
    if (caseIds.length === 0) {
      findings.add("V2_TRACE", `trace-ledger.json#${traceId}`, "trace names no case");
    }
    for (const caseId of caseIds) {
      if (!cases.has(caseId)) {
        findings.add(
          "V2_TRACE",
          `trace-ledger.json#${traceId}`,
          `unknown case ${caseId}`,
        );
        continue;
      }
      coveredCases.add(caseId);
      if (!caseToTraces.get(caseId)?.has(traceId)) {
        findings.add(
          "V2_TRACE",
          `trace-ledger.json#${traceId}`,
          `case ${caseId} does not list this trace`,
        );
      }
    }
    for (const controlId of (trace["controlIds"] as string[] | undefined) ?? []) {
      if (!controlIds.has(controlId)) {
        findings.add(
          "V2_TRACE",
          `trace-ledger.json#${traceId}`,
          `unknown control ${controlId}`,
        );
      } else {
        coveredControls.add(controlId);
      }
    }
    const owner = trace["evidenceOwner"] as string;
    if (owner !== STATIC_EVIDENCE_OWNER && !EVIDENCE_OWNER_PATTERN.test(owner)) {
      findings.add(
        "V2_TRACE",
        `trace-ledger.json#${traceId}`,
        `invalid evidence owner ${owner}`,
      );
    }
  }
  const traceIds = new Set(traces.map((trace) => trace["id"] as string));
  for (const [caseId, listed] of caseToTraces) {
    if (!coveredCases.has(caseId)) {
      findings.add("V2_TRACE", "trace-ledger.json", `case ${caseId} belongs to no trace`);
    }
    for (const traceId of listed) {
      if (!traceIds.has(traceId)) {
        findings.add("V2_TRACE", `${caseId}/traceIds`, `unknown trace ${traceId}`);
        continue;
      }
      const trace = traces.find((row) => row["id"] === traceId);
      const listedCases = (trace?.["caseIds"] as string[] | undefined) ?? [];
      if (!listedCases.includes(caseId)) {
        findings.add(
          "V2_TRACE",
          `${caseId}/traceIds`,
          `trace ${traceId} does not list this case`,
        );
      }
    }
  }
  for (const controlId of controlIds) {
    if (!coveredControls.has(controlId)) {
      findings.add(
        "V2_TRACE",
        "trace-ledger.json",
        `control ${controlId} belongs to no trace`,
      );
    }
  }
}

function checkProvenance(
  findings: Findings,
  fixtures: Fixtures,
  cases: Map<string, CaseEntry>,
): void {
  const ledger = fixtures.get("provenance-ledger.json");
  if (!ledger) return;
  if (ledger["expectedValuesGenerated"] !== false) {
    findings.add(
      "V2_PROVENANCE",
      "provenance-ledger.json#/expectedValuesGenerated",
      "must be false",
    );
  }
  if (ledger["productionOutputUsed"] !== false) {
    findings.add(
      "V2_PROVENANCE",
      "provenance-ledger.json#/productionOutputUsed",
      "must be false",
    );
  }
  if (ledger["reviewState"] !== "reviewed-for-v2-spec") {
    findings.add(
      "V2_PROVENANCE",
      "provenance-ledger.json#/reviewState",
      "unexpected review state",
    );
  }
  const authorities = new Set(
    ((ledger["authorities"] as JsonObject[] | undefined) ?? []).map(
      (authority) => authority["id"] as string,
    ),
  );
  for (const required of [
    "V2-AUTH-PLAN",
    "V2-AUTH-V0",
    "V2-AUTH-V1",
    "V2-AUTH-DOMAIN",
    "V2-AUTH-DERIVED",
    "V2-AUTH-INDEPENDENCE",
  ]) {
    if (!authorities.has(required)) {
      findings.add(
        "V2_PROVENANCE",
        "provenance-ledger.json#/authorities",
        `missing ${required}`,
      );
    }
  }
  for (const [caseId, entry] of cases) {
    for (const authorityId of (entry.record["authorityIds"] as string[] | undefined) ??
      []) {
      if (!authorities.has(authorityId)) {
        findings.add(
          "V2_PROVENANCE",
          `${caseId}/authorityIds`,
          `unknown authority ${authorityId}`,
        );
      }
    }
  }
}

function checkMutationControls(findings: Findings, fixtures: Fixtures): void {
  const controls = fixtures.get("mutation-controls.json");
  if (!controls) return;
  const list = (controls["controls"] as JsonObject[] | undefined) ?? [];
  const seen = new Set<string>();
  for (const control of list) {
    const id = control["id"] as string;
    const path = `mutation-controls.json#${id}`;
    if (seen.has(id)) findings.add("V2_CASE", path, "duplicate control id");
    seen.add(id);
    const file = control["file"] as string;
    if (!(V2_FIXTURE_FILES as readonly string[]).includes(file)) {
      findings.add("V2_CASE", path, `unknown file ${file}`);
      continue;
    }
    if (
      !(V2_FINDING_CODES as readonly string[]).includes(
        control["expectedFindingCode"] as string,
      )
    ) {
      findings.add("V2_CASE", path, "unknown expected finding code");
    }
    const target = fixtures.get(file);
    if (
      target &&
      resolvePointer(target, control["pointer"] as string) === undefined
    ) {
      findings.add(
        "V2_CASE",
        path,
        `pointer ${String(control["pointer"])} does not resolve`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry                                                              */
/* ------------------------------------------------------------------ */

export type V2Overlay = Readonly<{ file: string; document: unknown }>;

export async function validateV2Contract(
  overlay?: V2Overlay,
  fixtureRoot: string = DEFAULT_FIXTURE_ROOT,
): Promise<V2ContractValidationReport> {
  const findings = new Findings();
  const fixtures: Fixtures = new Map();
  for (const file of V2_FIXTURE_FILES) {
    try {
      const raw = await readFile(resolve(fixtureRoot, file), "utf8");
      fixtures.set(file, JSON.parse(raw) as JsonObject);
    } catch (error) {
      findings.add("V2_FILES", file, `unreadable fixture: ${String(error)}`);
    }
  }
  if (overlay) fixtures.set(overlay.file, overlay.document as JsonObject);
  const expectedSchemas: Readonly<Record<string, string>> = {
    "boundary-cases.json": "changes.fixtures.v2-boundary-cases.v1",
    "limit-cases.json": "changes.fixtures.v2-limit-cases.v1",
    "mutation-controls.json": "changes.fixtures.v2-mutation-controls.v1",
    "optimization-cases.json": "changes.fixtures.v2-optimization-cases.v1",
    "provenance-ledger.json": "changes.fixtures.v2-provenance-ledger.v1",
    "stepper-cases.json": "changes.fixtures.v2-stepper-cases.v1",
    "trace-ledger.json": "changes.fixtures.v2-trace-ledger.v1",
    "v2-progression-optimizer-contract.json":
      "changes.fixtures.v2-progression-optimizer-contract.v1",
  };
  for (const [file, schema] of Object.entries(expectedSchemas)) {
    const fixture = fixtures.get(file);
    if (fixture && fixture["schema"] !== schema) {
      findings.add("V2_SCHEMA", file, `expected schema ${schema}`);
    }
  }
  checkManifest(fixtures, findings);
  const cases = collectCases(fixtures);
  let optimizeCases = 0;
  let refusalCases = 0;
  let stepperCases = 0;
  let bruteForceCertifiedCases = 0;
  for (const [caseId, entry] of cases) {
    const path = `${entry.file}#${caseId}`;
    const kind = entry.record["kind"] as string;
    try {
      if (kind === "optimize" || kind === "refuse") {
        if (kind === "optimize") optimizeCases += 1;
        else refusalCases += 1;
        if (entry.record["bruteForceCertified"] === true) {
          bruteForceCertifiedCases += 1;
        }
        checkOptimizeCase(findings, path, entry.record, entry.defaults);
      } else if (kind === "stepper" || kind === "yield-equivalence") {
        stepperCases += 1;
        checkStepperCase(findings, path, entry.record, cases);
      } else {
        findings.add("V2_CASE", path, `unknown case kind ${kind}`);
      }
    } catch (error) {
      findings.add("V2_CASE", path, `reference computation failed: ${String(error)}`);
    }
  }
  checkTraces(findings, fixtures, cases);
  checkProvenance(findings, fixtures, cases);
  checkMutationControls(findings, fixtures);
  const controls = fixtures.get("mutation-controls.json");
  const traces = fixtures.get("trace-ledger.json");
  const provenance = fixtures.get("provenance-ledger.json");
  return {
    schema: "changes.validation.v2-contract.v1",
    package: "V2",
    outcome: findings.list.length === 0 ? "pass" : "fail",
    counts: {
      files: fixtures.size,
      cases: cases.size,
      optimizeCases,
      refusalCases,
      stepperCases,
      bruteForceCertifiedCases,
      mutationControls: ((controls?.["controls"] as JsonObject[] | undefined) ?? [])
        .length,
      traces: ((traces?.["traces"] as JsonObject[] | undefined) ?? []).length,
      authorities: (
        (provenance?.["authorities"] as JsonObject[] | undefined) ?? []
      ).length,
    },
    findings: findings.list,
  };
}

async function main(): Promise<void> {
  const report = await validateV2Contract();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
