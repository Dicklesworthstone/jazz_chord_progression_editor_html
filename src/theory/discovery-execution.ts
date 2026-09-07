import {
  DISCOVERY_ENGINE_CEILINGS as E, DISCOVERY_EXECUTION_LIMITS as L, DISCOVERY_EXECUTION_SCHEMA,
  type DiscoveryAdvance, type DiscoveryAllocation, type DiscoveryArena, type DiscoveryCounters,
  type DiscoveryCursor, type DiscoveryLimit, type DiscoveryOption, type DiscoveryOptionDraft,
  type DiscoveryRefusal, type DiscoveryRequest, type DiscoveryResult, type DiscoveryStepperCreation,
  type DiscoveryValue, type DiscoveryStepper,
} from "./discovery-execution-contract";
import { discoveryArenaCapacity } from "./discovery-arena";
import { captureDiscoveryValue, type CapturedDiscoveryValue } from "./discovery-data";
import { makeBeatDuration, makeBeatPosition } from "../domain";

export type DiscoveryExpansionSink = Readonly<{
  /** The producer is never invoked after its corresponding budget is exhausted. */
  enqueue: (produce: () => DiscoveryValue) => boolean;
  offer: (produce: () => DiscoveryOptionDraft) => boolean;
}>;
export type DiscoveryEnumerationKernel = Readonly<{
  /** Composition selects the accepted engine profile; request data cannot. */
  family: "H1" | "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8" | "G9" | "protocol";
  /** Proved per-engine expansion workspace; not a measured-work assertion. */
  maximumWorkspaceBytes: number;
  seed: (request: DiscoveryRequest, sink: DiscoveryExpansionSink) => void;
  expand: (state: DiscoveryValue, request: DiscoveryRequest, sink: DiscoveryExpansionSink) => void;
}>;
type QueueEntry = { capture: CapturedDiscoveryValue; depth: number; next: QueueEntry | null };
type HeldOption = { draft: DiscoveryOptionDraft; capture: CapturedDiscoveryValue };
type MeasuredResult = Readonly<{ requestCanonical: string; counters: DiscoveryCounters; stepper: DiscoveryStepper; arena: DiscoveryArena }>;
const measuredResults = new WeakMap<DiscoveryResult, MeasuredResult>();

/** Read-only provenance; application still requires its own private registry. */
export function inspectMeasuredDiscoveryResult(result: DiscoveryResult): Pick<MeasuredResult, "requestCanonical" | "counters"> | null {
  const measured = measuredResults.get(result);
  return measured === undefined ? null : Object.freeze({ requestCanonical: measured.requestCanonical, counters: measured.counters });
}
export function isMeasuredDiscoveryResult(result: DiscoveryResult, stepper: DiscoveryStepper, arena: DiscoveryArena): boolean {
  const measured = measuredResults.get(result);
  return measured !== undefined && measured.stepper === stepper && measured.arena === arena && measured.counters === result.counters;
}
function freezeOwned<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
}
const token = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/u.test(value);
const safe = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const array = (value: unknown): boolean => Array.isArray(value);
const keys = (value: object, names: readonly string[]): boolean =>
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
function validRequest(request: DiscoveryRequest): boolean {
  try {
    const identity = request.identity;
    if (!keys(request, ["schema", "identity", "source", "constraints", "input", "budgets"]) ||
      !keys(identity, ["requestId", "documentId", "sourceRevision", "engine", "policy", "laws", "corpora", "seed"]) ||
      Object.getOwnPropertyDescriptor(request, "schema")?.value !== DISCOVERY_EXECUTION_SCHEMA || !token(identity.requestId) || !token(identity.documentId) ||
      !safe(identity.sourceRevision) || (identity.seed !== null && (!safe(identity.seed) || identity.seed > 0xffff_ffff)) ||
      !array(request.source) || request.source.length > L.sourceEvents ||
      !array(identity.laws) || !array(identity.corpora)) return false;
    for (const version of [identity.engine, identity.policy, ...identity.laws, ...identity.corpora]) {
      if (!keys(version, ["id", "version"]) || !token(version.id) || !token(version.version)) return false;
    }
    for (const versions of [identity.laws, identity.corpora]) {
      if (versions.length > L.versions || versions.some((version, i) => i > 0 && version.id <= (versions[i - 1]?.id ?? ""))) return false;
    }
    const maxima: Record<string, number> = { expandedStates: L.expandedStates,
      generatedCandidates: L.generatedCandidates, retainedOptions: L.retainedOptions,
      queuedStates: L.queuedStates, outgoingPerState: L.outgoingPerState, depth: L.depth,
      workUnits: L.workUnits, trackedBytes: L.trackedBytes };
    if (Object.keys(request.budgets).length !== Object.keys(maxima).length) return false;
    for (const [key, maximum] of Object.entries(maxima)) {
      const value: unknown = Object.getOwnPropertyDescriptor(request.budgets, key)?.value;
      if (!safe(value) || value > maximum) return false;
    }
    const eventIds = new Set<string>();
    for (const entry of request.source) {
      if (!keys(entry, ["event", "position", "selectedRealizationId"]) ||
        !token(entry.event.id) || eventIds.has(entry.event.id) ||
        !safe(entry.position.numerator) || !safe(entry.position.denominator) ||
        !safe(entry.event.duration.numerator) || entry.event.duration.numerator === 0 ||
        !safe(entry.event.duration.denominator) ||
        (entry.selectedRealizationId !== null && !token(entry.selectedRealizationId))) return false;
      const position = makeBeatPosition(entry.position), duration = makeBeatDuration(entry.event.duration);
      if (!position.ok || !duration.ok || !keys(entry.position, ["numerator", "denominator"]) ||
        !keys(entry.event.duration, ["numerator", "denominator"]) ||
        position.value.numerator !== entry.position.numerator || position.value.denominator !== entry.position.denominator ||
        duration.value.numerator !== entry.event.duration.numerator || duration.value.denominator !== entry.event.duration.denominator) return false;
      eventIds.add(entry.event.id);
    }
    return true;
  } catch { return false; }
}
function validOption(option: DiscoveryOptionDraft): boolean {
  return keys(option, ["value", "proposal", "evidence", "counterevidence", "missingPremises", "costs", "order"]) &&
    array(option.order) && option.order.length <= L.costAxes && option.order.every(Number.isFinite) &&
    array(option.costs) && option.costs.length <= L.costAxes &&
    option.costs.every(axis => keys(axis, ["id", "family", "unit", "direction", "value", "target"]) && token(axis.id) &&
      ["voice-leading", "harmony", "target-fit", "corpus", "complexity"].includes(axis.family) &&
      ["semitones", "count", "weighted-count", "ratio", "rank"].includes(axis.unit) &&
      ["minimize", "maximize", "target"].includes(axis.direction) && Number.isFinite(axis.value) &&
      (axis.direction === "target" ? typeof axis.target === "number" && Number.isFinite(axis.target) : axis.target === null)) &&
    new Set(option.costs.map(axis => axis.id)).size === option.costs.length &&
    [option.evidence, option.counterevidence, option.missingPremises].every(rows => array(rows) && rows.length <= L.evidenceRows &&
      rows.every(row => keys(row, ["kind", "id", "statement", "sourceEventIds"]) &&
        ["rule", "corpus", "context", "counterevidence", "missing-premise"].includes(row.kind) && token(row.id) &&
        typeof row.statement === "string" && array(row.sourceEventIds) &&
        row.sourceEventIds.length <= L.sourceEvents && row.sourceEventIds.every(token)));
}
function withinProfile(request: DiscoveryRequest, family: DiscoveryEnumerationKernel["family"]): boolean {
  const b = request.budgets;
  switch (family) {
    case "H1": return request.source.length <= E.H1.sourceEvents;
    case "G0": return b.retainedOptions <= E.G0.retainedOptions;
    case "G2": return request.source.length <= E.G2.sourceEvents && b.retainedOptions <= E.G2.retainedOptions;
    case "G3": return b.outgoingPerState <= E.G3.outgoingPerState && b.expandedStates <= E.G3.expandedStates && b.retainedOptions <= E.G3.retainedOptions;
    case "G5": return b.depth <= E.G5.depth && b.outgoingPerState <= E.G5.outgoingPerState;
    case "G1": case "G4": case "G6": case "G7": case "G8": case "G9": case "protocol": return true;
  }
}
function compareOptions(left: HeldOption, right: HeldOption): number {
  const a = left.draft.order, b = right.draft.order;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i], y = b[i];
    if (x !== undefined && y !== undefined && x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length || (left.capture.canonical < right.capture.canonical ? -1 : left.capture.canonical > right.capture.canonical ? 1 : 0);
}
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i += 1; }
    else bytes += code < 128 ? 1 : code < 2048 ? 2 : 3;
  }
  return bytes;
}

/** Counted FIFO protocol, usable by registered pure bounded enumeration kernels. */
export function createDiscoveryStepper(request: DiscoveryRequest, arena: DiscoveryArena,
  kernel: DiscoveryEnumerationKernel): DiscoveryStepperCreation {
  const admission = captureDiscoveryValue(request, arena, L.requestBytes, L.snapshotBytes);
  if (!admission.ok) return admission;
  const requestReservation = admission.value.reservation;
  if (!validRequest(request) || discoveryArenaCapacity(arena) !== request.budgets.trackedBytes ||
    !safe(kernel.maximumWorkspaceBytes) || kernel.maximumWorkspaceBytes > L.trackedBytes || !withinProfile(request, kernel.family)) {
    arena.release(requestReservation);
    return Object.freeze({ ok: false, refusal: Object.freeze({ code: "discovery.invalid-request", path: [] }) });
  }
  let bound: DiscoveryRequest;
  try { bound = freezeOwned(structuredClone(request)); }
  catch {
    arena.release(requestReservation);
    return Object.freeze({ ok: false, refusal: Object.freeze({ code: "discovery.invalid-request", path: [] }) });
  }
  const requestCanonical = admission.value.canonical;
  const requestBytes = admission.value.bytes;
  const owned = new Set<DiscoveryAllocation>([requestReservation]);
  // Fixed control, cursor, result envelope and 128 bounded option wrappers/sort
  // slots. Reserved once, so partitioning work into yields cannot change counts.
  const control = arena.reserve(131072 + L.retainedOptions * 256);
  if (control === null) {
    arena.release(requestReservation);
    return Object.freeze({ ok: false, refusal: Object.freeze({ code: "discovery.input-limit", path: ["trackedBytes"] }) });
  }
  owned.add(control);
  let head: QueueEntry | null = null, tail: QueueEntry | null = null;
  let workUnits = 0, expandedStates = 0, generatedCandidates = 0, queuedStates = 0,
    peakQueuedStates = 0, depthReached = 0;
  const options: HeldOption[] = [];
  let optionBytes = 0;
  let limit: DiscoveryLimit | null = null;
  let refusal: DiscoveryRefusal | null = null;
  let terminal: DiscoveryResult | null = null;
  let cursor: DiscoveryCursor | null = null;
  const counters = (): DiscoveryCounters => Object.freeze({ workUnits,
    workQuanta: Math.ceil(workUnits / L.workUnitsPerSemanticQuantum), expandedStates,
    generatedCandidates, retainedOptions: options.length, queuedStates, peakQueuedStates,
    depthReached, ...arena.inspect() });
  const release = (allocation: DiscoveryAllocation): void => {
    if (owned.delete(allocation)) arena.release(allocation);
  };
  const stopAt = (reason: DiscoveryLimit): false => { limit ??= reason; return false; };
  const invalid = (problem: DiscoveryRefusal): false => { refusal ??= problem; return false; };
  const capture = (value: unknown, maximum: number): CapturedDiscoveryValue | null => {
    const made = captureDiscoveryValue(value, arena, L.resultBytes, maximum);
    if (!made.ok) {
      if (made.refusal.code === "discovery.input-limit") stopAt(
        made.refusal.path[0] === "trackedBytes" || made.refusal.path[0] === "graphBytes" ? "memory-cap" : "result-byte-cap");
      // Producer-owned property names can be enormous. Keep the outward error
      // at its exact bounded packet lane rather than retaining that failed graph.
      else invalid(Object.freeze({ code: "discovery.invalid-kernel-output", path: [maximum === L.stateBytes ? "state" : "option"] }));
      return null;
    }
    owned.add(made.value.reservation);
    return made.value;
  };
  const sink = (depth: number, initializing: boolean): Readonly<{ value: DiscoveryExpansionSink; close: () => void }> => {
    let outgoing = 0, offers = 0;
    let open = true;
    const value: DiscoveryExpansionSink = Object.freeze({
      enqueue: (produce): boolean => {
        if (!open || limit !== null || refusal !== null || terminal !== null) return false;
        if (queuedStates >= bound.budgets.queuedStates) return stopAt("queue-cap");
        if (!initializing && outgoing >= bound.budgets.outgoingPerState) return stopAt("outgoing-cap");
        if (depth > bound.budgets.depth) return stopAt("depth-cap");
        const data = capture(produce(), L.stateBytes);
        if (data === null) return false;
        const node: QueueEntry = { capture: data, depth, next: null };
        if (tail === null) head = node; else tail.next = node;
        tail = node; queuedStates += 1; outgoing += 1;
        peakQueuedStates = Math.max(peakQueuedStates, queuedStates);
        return true;
      },
      offer: (produce): boolean => {
        if (!open || limit !== null || refusal !== null || terminal !== null) return false;
        if (initializing) return invalid(Object.freeze({ code: "discovery.invalid-kernel-output", path: ["seed", "offer"] }));
        if (generatedCandidates >= bound.budgets.generatedCandidates) return stopAt("candidate-cap");
        if (offers >= L.retainedOptions) return stopAt("outgoing-cap");
        const draft = produce(); generatedCandidates += 1; offers += 1;
        const data = capture(draft, L.optionBytes);
        if (data === null) return false;
        if (!validOption(draft) || [draft.evidence, draft.counterevidence, draft.missingPremises].some(rows => rows.some(row =>
          row.sourceEventIds.some(id => !bound.source.some(source => source.event.id === id))))) {
          release(data.reservation); return invalid(Object.freeze({ code: "discovery.invalid-kernel-output", path: [] }));
        }
        if (options.some(row => row.capture.canonical === data.canonical)) { release(data.reservation); return true; }
        if (options.length >= bound.budgets.retainedOptions) { release(data.reservation); return stopAt("option-cap"); }
        // This exact payload lower bound can stop an impossible retention now.
        // The complete envelope/counters/ordinal IDs are measured at finish,
        // before allocating the outward result. There is no invented headroom.
        const needed = requestBytes + optionBytes + data.bytes;
        if (needed > L.resultBytes) { release(data.reservation); return stopAt("result-byte-cap"); }
        options.push({ draft: freezeOwned(structuredClone(draft)), capture: data });
        optionBytes += data.bytes;
        return true;
      },
    });
    return Object.freeze({ value, close: () => { open = false; } });
  };
  const finish = (cancelled?: "cancelled" | "stale"): DiscoveryResult => {
    if (terminal !== null) return terminal;
    for (let node = head; node !== null; node = node.next) release(node.capture.reservation);
    head = null; tail = null; queuedStates = 0;
    if (cancelled !== undefined || refusal !== null) {
      for (const row of options) release(row.capture.reservation);
      options.length = 0;
    }
    options.sort(compareOptions);
    const empty: readonly [] = Object.freeze([]);
    const base = () => ({ identity: bound.identity, request: bound, limits: bound.budgets,
      counters: counters(), evidence: empty, counterevidence: empty, missingPremises: empty });
    const wireBytes = (): number => {
      const kind = cancelled ?? (refusal !== null ? "refused" : limit !== null ? "bounded-partial" : options.length === 0 ? "no-result" : "complete");
      const envelope = { ...base(), request: null, kind,
        termination: cancelled ?? (refusal !== null ? "refused" : limit ?? "complete"),
        ...(refusal === null ? {} : { refusal }), options: [] };
      // All retained payload byte counts came from the passive-data scanner.
      // Substitute for the literal null and empty array in the small envelope.
      let bytes = utf8Bytes(JSON.stringify(envelope)) - 4 + requestBytes;
      for (let i = 0; i < options.length; i += 1) {
        const row = options[i];
        if (row !== undefined) bytes += row.capture.bytes + JSON.stringify({ id: `option.${String(i)}` }).length - 1 + (i === 0 ? 0 : 1);
      }
      return bytes;
    };
    while (wireBytes() > L.resultBytes && options.length > 0) {
      limit = "result-byte-cap";
      const removed = options.pop();
      if (removed !== undefined) release(removed.capture.reservation);
    }
    const rows: readonly DiscoveryOption[] = Object.freeze(options.map((row, i) =>
      Object.freeze({ ...row.draft, id: `option.${String(i)}` })));
    if (cancelled === "cancelled") terminal = Object.freeze({ ...base(), kind: "cancelled", termination: "cancelled", options: empty });
    else if (cancelled === "stale") terminal = Object.freeze({ ...base(), kind: "stale", termination: "stale", options: empty });
    else if (refusal !== null) terminal = Object.freeze({ ...base(), kind: "refused", termination: "refused", refusal, options: empty });
    else if (limit !== null) terminal = Object.freeze({ ...base(), kind: "bounded-partial", termination: limit, options: rows });
    else if (rows.length === 0) terminal = Object.freeze({ ...base(), kind: "no-result", termination: "complete", options: empty });
    else terminal = Object.freeze({ ...base(), kind: "complete", termination: "complete", options: rows });
    measuredResults.set(terminal, Object.freeze({ requestCanonical, counters: terminal.counters, stepper, arena }));
    return terminal;
  };
  const invoke = (depth: number, initializing: boolean, action: (value: DiscoveryExpansionSink) => void): void => {
    const workspace = arena.reserve(kernel.maximumWorkspaceBytes);
    if (workspace === null) { stopAt("memory-cap"); return; }
    owned.add(workspace);
    const currentSink = sink(depth, initializing);
    try { action(currentSink.value); }
    catch { invalid(Object.freeze({ code: "discovery.invalid-kernel-output", path: [] })); }
    finally { currentSink.close(); release(workspace); }
  };
  invoke(0, true, value => { kernel.seed(bound, value); });
  const step = (quantum: number, supplied: DiscoveryCursor | null): DiscoveryAdvance => {
    if (terminal !== null) return Object.freeze({ kind: "finished", result: terminal });
    if (!Number.isInteger(quantum) || quantum < L.stepMinimum || quantum > L.stepMaximum) {
      invalid(Object.freeze({ code: "discovery.invalid-quantum", path: [] }));
    } else if (supplied !== cursor) invalid(Object.freeze({ code: "discovery.invalid-cursor", path: [] }));
    for (let unit = 0; unit < quantum && limit === null && refusal === null; unit += 1) {
      const node = head;
      if (node === null) break;
      if (workUnits >= bound.budgets.workUnits) { stopAt("work-cap"); break; }
      if (expandedStates >= bound.budgets.expandedStates) { stopAt("state-cap"); break; }
      head = node.next; node.next = null;
      if (head === null) tail = null;
      queuedStates -= 1;
      invoke(node.depth + 1, false, value => {
        workUnits += 1; expandedStates += 1; depthReached = Math.max(depthReached, node.depth);
        kernel.expand(node.capture.value, bound, value);
      });
      release(node.capture.reservation);
    }
    if (head === null || limit !== null || refusal !== null) return Object.freeze({ kind: "finished", result: finish() });
    cursor = Object.freeze({ requestId: bound.identity.requestId, completedWorkUnits: workUnits });
    return Object.freeze({ kind: "yielded", cursor, counters: counters() });
  };
  const dispose = (): void => {
    const result = finish("cancelled");
    measuredResults.delete(result);
    for (const allocation of owned) arena.release(allocation);
    owned.clear(); options.length = 0;
  };
  const stepper: DiscoveryStepper = Object.freeze({ step,
    cancel: (reason: "cancelled" | "stale") => finish(reason), dispose });
  return Object.freeze({ ok: true, stepper });
}
