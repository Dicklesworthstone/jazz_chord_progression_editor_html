import {
  captureDiscoveryValue, createDiscoveryArena, inspectMeasuredDiscoveryResult, isMeasuredDiscoveryResult,
  DISCOVERY_EXECUTION_LIMITS as L,
  type CapturedDiscoveryValue, type DiscoveryAllocation, type DiscoveryArena, type DiscoveryCursor,
  type DiscoveryRequest, type DiscoveryResult, type DiscoveryStepper, type DiscoveryRefusal,
} from "../theory";
import type { DiscoveryApplicationPorts, DiscoveryApplyResult, DiscoveryJobService,
  DiscoveryJobView, DiscoveryStartResult } from "./discovery-execution-contract";
import type { AppState, ApplySuggestionCommand } from "./application-state-contract";
import { beginApplicationRequest, runDocumentCommand, settleApplicationRequest } from "./application-state";
import { deepStructuralEqual } from "./application-state-helpers";
import { validateDerivedCommand } from "./application-derived-patch";
import { discoveryScopePreserved, discoverySourceMatches } from "./discovery-binding";

type Job = {
  request: DiscoveryRequest; requestCapture: CapturedDiscoveryValue; source: AppState["document"];
  arena: DiscoveryArena; owned: DiscoveryAllocation[]; stepper: DiscoveryStepper;
  a0RequestId: number; generation: number; channel: MessageChannel | null; cursor: DiscoveryCursor | null;
  result: DiscoveryResult | null; resolve: ((result: DiscoveryStartResult) => void) | null;
  cancelled: "cancelled" | "stale" | null; consumed: boolean;
};
const refused = (code: DiscoveryRefusal["code"], path: readonly (string | number)[] = []): DiscoveryRefusal =>
  Object.freeze({ code, path: Object.freeze([...path]) });
function freezeOwned<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
}

/** One real task per quantum; A0 alone owns document and history publication. */
export function createDiscoveryJobService(ports: DiscoveryApplicationPorts, workQuantum = 64): DiscoveryJobService {
  if (!Number.isInteger(workQuantum) || workQuantum < L.stepMinimum || workQuantum > L.stepMaximum) {
    throw new RangeError("Discovery scheduling quantum must be an integer in 1..1024");
  }
  let active: Job | null = null, generation = 0, sequence = 0, disposed = false;
  let retiring: Job | null = null;
  let view: DiscoveryJobView = Object.freeze({ status: "idle", result: null, yields: 0, scheduledCallbacks: 0,
    retainedBytes: 0, openMessagePorts: 0, listeners: 0, publicationAttempts: 0 });
  const listeners = new Set<(current: DiscoveryJobView) => void>();
  const owns = (job: Job): boolean => active === job;
  const channelOf = (job: Job): MessageChannel | null => job.channel;
  const observe = (): DiscoveryJobView => Object.freeze({ ...view,
    retainedBytes: (active ?? retiring)?.arena.inspect().retainedBytes ?? 0,
    openMessagePorts: active?.channel === null || active === null ? 0 : 2,
    listeners: listeners.size, publicationAttempts: retiring === null ? 0 : 1 });
  const publish = (patch: Partial<DiscoveryJobView>): void => {
    view = Object.freeze({ ...view, ...patch });
    for (const listener of listeners) listener(observe());
  };
  const closeChannel = (job: Job): void => {
    if (job.channel === null) return;
    job.channel.port1.onmessage = null;
    job.channel.port1.close(); job.channel.port2.close(); job.channel = null;
  };
  const settle = (job: Job, disposition: "complete" | "cancel"): void => {
    const state = ports.readState();
    const result = settleApplicationRequest({ state, kind: "suggestion-search", id: job.a0RequestId,
      documentId: job.request.identity.documentId, baseRevision: job.request.identity.sourceRevision, disposition });
    if (result.state !== state) ports.writeState(result.state);
  };
  const release = (job: Job): void => {
    closeChannel(job); job.stepper.dispose();
    for (const allocation of job.owned) job.arena.release(allocation);
    job.owned.length = 0; job.result = null;
  };
  const current = (job: Job): boolean => {
    if (disposed || active !== job || job.generation !== generation || job.cancelled !== null) return false;
    const state = ports.readState();
    return state.document === job.source && discoverySourceMatches(job.request, state, ports.readSelectedRealization) &&
      deepStructuralEqual(job.request.identity.engine, ports.engine.version) &&
      deepStructuralEqual(job.request.identity.policy, ports.engine.policy) &&
      deepStructuralEqual(job.request.identity.laws, ports.engine.laws) &&
      deepStructuralEqual(job.request.identity.corpora, ports.engine.corpora) &&
      state.pendingRequests.some(row => row.kind === "suggestion-search" && row.id === job.a0RequestId &&
        row.documentId === job.request.identity.documentId && row.baseRevision === job.request.identity.sourceRevision && row.status === "running");
  };
  const cancel = (reason: "cancelled" | "stale" = "cancelled"): void => {
    generation += 1;
    const job = active; active = null;
    if (job !== null) {
      job.cancelled = reason;
      const result = job.stepper.cancel(reason);
      const resolve = job.resolve; job.resolve = null;
      settle(job, "cancel"); closeChannel(job);
      job.result = null;
      if (retiring !== job) release(job);
      resolve?.(Object.freeze({ ok: true, result }));
    }
    publish({ status: "finished", result: null, scheduledCallbacks: 0 });
  };
  const terminalFailure = (job: Job, refusal: DiscoveryRefusal): void => {
    const resolve = job.resolve; job.resolve = null;
    if (active === job) active = null;
    settle(job, "cancel");
    if (retiring !== job) release(job);
    publish({ status: "finished", result: null, scheduledCallbacks: 0 });
    resolve?.(Object.freeze({ ok: false, refusal }));
  };
  const schedule = (job: Job): void => {
    if (active !== job || job.channel === null) return;
    publish({ scheduledCallbacks: 1 });
    // A subscriber may synchronously cancel or replace the job during publish.
    const channel = channelOf(job);
    if (owns(job) && channel !== null) channel.port2.postMessage(job.generation);
  };
  const advance = (job: Job): void => {
    if (!owns(job) || job.generation !== generation) return;
    publish({ scheduledCallbacks: 0 });
    if (!current(job)) { if (active === job) cancel("stale"); return; }
    try {
      const next = job.stepper.step(workQuantum, job.cursor);
      if (!current(job)) { if (owns(job)) cancel("stale"); return; }
      if (next.kind === "yielded") {
        job.cursor = next.cursor;
        publish({ yields: view.yields + 1 }); schedule(job); return;
      }
      const result = next.result, measurement = inspectMeasuredDiscoveryResult(result);
      if (!isMeasuredDiscoveryResult(result, job.stepper, job.arena) ||
        measurement?.requestCanonical !== job.requestCapture.canonical ||
        !deepStructuralEqual(result.request, job.request) || !deepStructuralEqual(result.identity, job.request.identity) ||
        !deepStructuralEqual(result.limits, job.request.budgets)) {
        terminalFailure(job, refused("discovery.invalid-proof")); return;
      }
      closeChannel(job);
      const resolve = job.resolve; job.resolve = null;
      if ((result.kind === "complete" || result.kind === "bounded-partial") && result.options.length > 0) {
        job.result = result;
        publish({ status: "ready", result, scheduledCallbacks: 0 });
      } else {
        active = null; settle(job, "complete"); release(job);
        publish({ status: "finished", result: null, scheduledCallbacks: 0 });
      }
      resolve?.(Object.freeze({ ok: true, result }));
    } catch { terminalFailure(job, refused("discovery.invalid-kernel-output")); }
  };
  const start = async (request: DiscoveryRequest): Promise<DiscoveryStartResult> => {
    if (disposed) return { ok: false, refusal: refused("discovery.invalid-request") };
    cancel();
    if (retiring !== null) return { ok: false, refusal: refused("discovery.input-limit", ["publicationAttempts"]) };
    let arena: DiscoveryArena | null = null;
    const owned: DiscoveryAllocation[] = [];
    let stepper: DiscoveryStepper | null = null;
    let admittedJob: Job | null = null;
    const failure = (refusal: DiscoveryRefusal): DiscoveryStartResult => {
      if (admittedJob !== null) terminalFailure(admittedJob, refusal);
      else { stepper?.dispose(); for (const allocation of owned) arena?.release(allocation); }
      return Object.freeze({ ok: false, refusal });
    };
    try {
      arena = createDiscoveryArena(request.budgets.trackedBytes);
      if (arena === null) return failure(refused("discovery.input-limit", ["trackedBytes"]));
      // Two bounded F2/F3/source-validation workspaces plus task/control slots.
      const workspace = arena.reserve(2 * L.snapshotBytes + 65_536);
      if (workspace === null) return failure(refused("discovery.input-limit", ["trackedBytes"]));
      owned.push(workspace);
      const captured = captureDiscoveryValue(request, arena, L.requestBytes, L.snapshotBytes);
      if (!captured.ok) return failure(captured.refusal);
      owned.push(captured.value.reservation);
      const bound = freezeOwned(structuredClone(request)), state = ports.readState();
      const snapshot = captureDiscoveryValue(state.document, arena, L.resultBytes, L.snapshotBytes);
      if (!snapshot.ok) return failure(snapshot.refusal);
      owned.push(snapshot.value.reservation);
      if (!discoverySourceMatches(bound, state, ports.readSelectedRealization)) return failure(refused("discovery.invalid-request", ["source"]));
      if (!deepStructuralEqual(bound.identity.engine, ports.engine.version) || !deepStructuralEqual(bound.identity.policy, ports.engine.policy) ||
        !deepStructuralEqual(bound.identity.laws, ports.engine.laws) || !deepStructuralEqual(bound.identity.corpora, ports.engine.corpora)) {
        return failure(refused("discovery.version-mismatch", ["identity"]));
      }
      const created = ports.engine.create(bound, arena);
      if (!created.ok) return failure(created.refusal);
      stepper = created.stepper;
      sequence = Math.max(sequence + 1, state.nextSequence, ...state.pendingRequests.map(row => row.id + 1));
      if (!Number.isSafeInteger(sequence) || sequence < 1) return failure(refused("discovery.input-limit", ["requestId"]));
      const begun = beginApplicationRequest({ state, request: { kind: "suggestion-search", id: sequence,
        documentId: bound.identity.documentId, baseRevision: bound.identity.sourceRevision, status: "running" } });
      if (!begun.ok) return failure(refused("discovery.invalid-request", ["pendingRequests"]));
      const job: Job = { request: bound, requestCapture: captured.value, source: state.document,
        arena, owned, stepper, a0RequestId: sequence, generation, channel: null, cursor: null,
        result: null, resolve: null, cancelled: null, consumed: false };
      admittedJob = job; active = job;
      const completion = new Promise<DiscoveryStartResult>(resolve => { job.resolve = resolve; });
      ports.writeState(begun.state);
      if (!current(job)) { if (active === job) cancel("stale"); return await completion; }
      job.channel = new MessageChannel(); job.channel.port1.onmessage = () => { advance(job); };
      publish({ status: "running", result: null, yields: 0, scheduledCallbacks: 0 });
      schedule(job);
      return await completion;
    } catch { return failure(refused("discovery.invalid-request")); }
  };
  const validate = (job: Job, optionId: string): Readonly<{ ok: true; command: ApplySuggestionCommand; capture: CapturedDiscoveryValue }> |
    Readonly<{ ok: false; refusal: DiscoveryRefusal }> => {
    const result = job.result;
    if (result === null || !isMeasuredDiscoveryResult(result, job.stepper, job.arena) ||
      inspectMeasuredDiscoveryResult(result)?.requestCanonical !== job.requestCapture.canonical) return { ok: false, refusal: refused("discovery.invalid-proof") };
    const option = result.options.find(row => row.id === optionId);
    if (option === undefined) return { ok: false, refusal: refused("discovery.invalid-proof", ["optionId"]) };
    const state = ports.readState();
    const validation = ports.publication.validate(job.request, option, state.document);
    if (!validation.ok) return validation;
    const captured = captureDiscoveryValue(validation.patch, job.arena, L.resultBytes, L.snapshotBytes);
    if (!captured.ok) return captured;
    job.owned.push(captured.value.reservation);
    const fail = (): Readonly<{ ok: false; refusal: DiscoveryRefusal }> => {
      job.arena.release(captured.value.reservation);
      return { ok: false, refusal: refused("discovery.invalid-patch") };
    };
    const patch = freezeOwned(structuredClone(validation.patch));
    const shape = ports.dependencies.decodeDocumentShape(patch.candidate);
    if (!shape.ok) return fail();
    const semantics = ports.dependencies.validateDocumentSemantics(shape.value);
    if (!semantics.ok || !deepStructuralEqual(semantics.value, patch.candidate) ||
      Object.getOwnPropertyDescriptor(patch, "exactTimingPreserved")?.value !== true || !deepStructuralEqual(patch.sourceEventIds, job.request.source.map(row => row.event.id)) ||
      !discoveryScopePreserved(state.document, patch.candidate, job.request)) return fail();
    const command: ApplySuggestionCommand = { kind: "apply-suggestion", id: `discovery.${String(job.a0RequestId)}`,
      label: "Apply discovery option", expectedDocumentId: state.document.id, expectedRevision: state.revision,
      logicalTimeMs: state.nextSequence, coalescing: null, suggestionId: option.id,
      providerId: job.request.identity.engine.id, requestId: job.a0RequestId, patch };
    if (!validateDerivedCommand(state, command).ok) return fail();
    return { ok: true, command, capture: captured.value };
  };
  const apply = async (optionId: string): Promise<DiscoveryApplyResult> => {
    const job = active;
    if (job === null || job.result === null || job.consumed) return { kind: "refused", refusal: refused("discovery.already-consumed") };
    job.consumed = true;
    if (!current(job)) { cancel("stale"); return { kind: "stale" }; }
    let before: CapturedDiscoveryValue | null = null, after: CapturedDiscoveryValue | null = null;
    try {
      const initial = validate(job, optionId);
      if (!initial.ok) { terminalFailure(job, initial.refusal); return { kind: "refused", refusal: initial.refusal }; }
      before = initial.capture;
      publish({ status: "applying" });
      if (!current(job)) {
        if (owns(job)) cancel("stale");
        return { kind: job.cancelled ?? "stale" };
      }
      let retired = false;
      retiring = job;
      try { retired = await ports.retireTransport(); } catch { retired = false; }
      if (job.cancelled !== null || active !== job) return { kind: job.cancelled ?? "cancelled" };
      if (!current(job)) { cancel("stale"); return { kind: "stale" }; }
      if (!retired) {
        const refusal = refused("discovery.retirement-failed"); terminalFailure(job, refusal); return { kind: "refused", refusal };
      }
      const final = validate(job, optionId);
      if (!final.ok) { terminalFailure(job, final.refusal); return { kind: "refused", refusal: final.refusal }; }
      after = final.capture;
      if (after.canonical !== before.canonical) {
        const refusal = refused("discovery.invalid-proof", ["patch"]); terminalFailure(job, refusal); return { kind: "refused", refusal };
      }
      if (!current(job)) { cancel("stale"); return { kind: "stale" }; }
      const transition = runDocumentCommand({ state: ports.readState(), command: final.command, dependencies: ports.dependencies });
      if (!transition.ok || transition.outcome !== "committed") {
        const refusal = refused("discovery.invalid-patch"); terminalFailure(job, refusal); return { kind: "refused", refusal };
      }
      // No await or subscriber callback between final validation and A0 commit.
      ports.writeState(transition.state);
      if (active === job) active = null;
      publish({ status: "finished", result: null, scheduledCallbacks: 0 });
      return { kind: "committed", revision: transition.state.revision };
    } catch {
      const refusal = refused("discovery.invalid-proof");
      if (active === job) terminalFailure(job, refusal);
      return { kind: "refused", refusal };
    } finally {
      if (before !== null) job.arena.release(before.reservation);
      if (after !== null) job.arena.release(after.reservation);
      if (retiring === job) {
        retiring = null;
        // Even a cancelled await retains its source/patch until this point.
        release(job);
        if (active === null) publish({});
      }
    }
  };
  return Object.freeze({ start, cancel, apply, inspect: observe,
    subscribe: (listener: (current: DiscoveryJobView) => void) => {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose: () => { if (!disposed) { disposed = true; cancel(); listeners.clear(); } },
  });
}
