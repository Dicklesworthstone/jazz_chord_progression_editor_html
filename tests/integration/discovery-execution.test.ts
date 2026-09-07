import { expect, test } from "bun:test";
import { undoDocumentCommand, type AppState, type DiscoveryPublicationAdapter } from "../../src/application";
import { createDiscoveryStepper, type DiscoveryOptionDraft, type DiscoveryRequest } from "../../src/theory";
import { annotationDraft, annotationPublication, discoveryApplicationFixture } from "../support/discovery-application-fixture";
import { discoveryFixtureKernel } from "../support/discovery-execution-fixture";

const persistent = (state: AppState) => ({ document: state.document, revision: state.revision,
  history: state.history, recovery: state.recovery, exportRevision: state.exportRevision });
function deferred() {
  let resolve: (value: boolean) => void = () => { throw new Error("Deferred resolver not initialized"); };
  const promise = new Promise<boolean>(settle => { resolve = settle; });
  return { promise, resolve };
}

test("real MessageChannel publishes busy before expansion and one A0 Apply/Undo preserves every source byte and marker", async () => {
  const f = discoveryApplicationFixture();
  try {
    expect(f.original.revision).toBe(5); expect(f.original.history.undo).toHaveLength(2);
    const pending = f.service.start(f.request);
    expect(f.service.inspect().status).toBe("running"); expect(f.visits).toEqual([]);
    expect(f.read().pendingRequests).toHaveLength(1); expect(f.service.inspect().scheduledCallbacks).toBe(1);
    const ready = await pending;
    expect(ready.ok).toBe(true); expect(f.visits).toEqual([0, 1, 2]); expect(f.service.inspect().yields).toBe(2);
    expect(f.service.inspect().status).toBe("ready"); expect(f.service.inspect().scheduledCallbacks).toBe(0);
    expect(persistent(f.read())).toEqual(persistent(f.original));
    const applied = await f.service.apply("option.0");
    expect(applied).toEqual({ kind: "committed", revision: 6 }); expect(f.retirementCalls()).toBe(1);
    expect(f.read().history.undo).toHaveLength(3); expect(f.read().pendingRequests).toEqual([]);
    expect(f.read().recovery).toEqual({ kind: "clean", persistedRevision: 3 }); expect(f.read().exportRevision).toBe(4);
    const before = f.original.document.sections.flatMap(s => s.measures.flatMap(m => m.events));
    const after = f.read().document.sections.flatMap(s => s.measures.flatMap(m => m.events));
    expect(after.map(event => ({ ...event, annotation: "" }))).toEqual(before.map(event => ({ ...event, annotation: "" })));
    expect(after[1]?.annotation).toBe("Keep the written line.");
    const undone = undoDocumentCommand({ state: f.read() });
    expect(undone.ok).toBe(true); expect(undone.state.revision).toBe(7); expect(undone.state.history.undo).toHaveLength(2);
    expect(JSON.stringify(undone.state.document)).toBe(JSON.stringify(f.original.document));
    expect((await f.service.apply("option.0")).kind).toBe("refused");
    expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
  } finally { f.service.dispose(); }
});

test("Apply rechecks real A0 source after retirement and preserves an intervening user edit", async () => {
  const retirement = deferred(), f = discoveryApplicationFixture({ retire: () => retirement.promise });
  try {
    await f.service.start(f.request);
    const applying = f.service.apply("option.0");
    expect(f.service.inspect().status).toBe("applying"); expect(f.retirementCalls()).toBe(1);
    f.editTitle("The user's newer chart"); const edited = persistent(f.read());
    retirement.resolve(true);
    expect(await applying).toEqual({ kind: "stale" }); expect(persistent(f.read())).toEqual(edited);
    expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
  } finally { retirement.resolve(true); f.service.dispose(); }
});

test("cancellation during retirement and a duplicate click never publish a second A0 command", async () => {
  for (const shouldCancel of [false, true]) {
    const retirement = deferred(), f = discoveryApplicationFixture({ retire: () => retirement.promise });
    try {
      await f.service.start(f.request); const applying = f.service.apply("option.0");
      const second = await f.service.apply("option.0");
      expect(second).toEqual({ kind: "refused", refusal: { code: "discovery.already-consumed", path: [] } });
      if (shouldCancel) f.service.cancel();
      retirement.resolve(true); const result = await applying;
      expect(result.kind).toBe(shouldCancel ? "cancelled" : "committed");
      expect(f.read().history.undo.length).toBe(shouldCancel ? 2 : 3);
      if (shouldCancel) expect(persistent(f.read())).toEqual(persistent(f.original));
      expect(f.retirementCalls()).toBe(1); expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
    } finally { retirement.resolve(true); f.service.dispose(); }
  }
});

test("failed and rejected retirement consume the attempt without changing document/history/markers", async () => {
  for (const reject of [false, true]) {
    const f = discoveryApplicationFixture({ retire: () => reject ? Promise.reject(new Error("Retirement failed")) : Promise.resolve(false) });
    try {
      await f.service.start(f.request);
      expect(await f.service.apply("option.0")).toEqual({ kind: "refused", refusal: { code: "discovery.retirement-failed", path: [] } });
      expect(persistent(f.read())).toEqual(persistent(f.original)); expect(f.read().pendingRequests).toEqual([]);
      expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
    } finally { f.service.dispose(); }
  }
});

test("source edit, Stop cancellation and disposal at each real task yield prevent later work/publication", async () => {
  for (const action of ["edit", "cancel", "dispose"]) for (let cut = 0; cut < 3; cut += 1) {
    const f = discoveryApplicationFixture();
    try {
      const unsubscribe = f.service.subscribe(view => {
        if (view.status !== "running" || view.yields !== cut) return;
        unsubscribe();
        if (action === "edit") f.editTitle("Edited while discovery is running");
        else if (action === "cancel") f.service.cancel();
        else f.service.dispose();
      });
      const result = await f.service.start(f.request);
      if (!result.ok) throw new Error(result.refusal.code);
      expect(result.result.kind).toBe(action === "edit" ? "stale" : "cancelled");
      expect(result.result.options).toEqual([]); expect(f.visits.length).toBe(cut);
      expect(f.read().history.undo.length).toBe(action === "edit" ? 3 : 2);
      expect(f.retirementCalls()).toBe(0); expect(f.service.inspect().scheduledCallbacks).toBe(0);
      expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
    } finally { f.service.dispose(); }
  }
});

test("a replacement job cancels the queued predecessor and only its own result can Apply", async () => {
  const f = discoveryApplicationFixture();
  try {
    const first = f.service.start(f.request);
    const second = f.service.start({ ...f.request, identity: { ...f.request.identity, requestId: "replacement.2" } });
    const old = await first, ready = await second;
    expect(old.ok && old.result.kind).toBe("cancelled"); expect(ready.ok && ready.result.identity.requestId).toBe("replacement.2");
    expect(f.arenas[0]?.inspect().retainedBytes).toBe(0); expect(f.visits).toEqual([0, 1, 2]);
    expect((await f.service.apply("option.0")).kind).toBe("committed");
    expect(f.arenas[1]?.inspect().retainedBytes).toBe(0);
  } finally { f.service.dispose(); }
});

test("one corrupted request binding at a time refuses before work or retirement", async () => {
  const mutations: readonly ((request: DiscoveryRequest) => DiscoveryRequest)[] = [
    r => ({ ...r, identity: { ...r.identity, sourceRevision: 4 } }),
    r => ({ ...r, identity: { ...r.identity, engine: { ...r.identity.engine, version: "wrong" } } }),
    r => ({ ...r, identity: { ...r.identity, policy: { ...r.identity.policy, version: "wrong" } } }),
    r => ({ ...r, identity: { ...r.identity, laws: [{ id: "foreign", version: "1" }] } }),
    r => ({ ...r, identity: { ...r.identity, corpora: [{ id: "foreign", version: "1" }] } }),
    r => ({ ...r, source: [...r.source].reverse() }),
    r => ({ ...r, source: r.source.map(row => ({ ...row, selectedRealizationId: "wrong" })) }),
    r => ({ ...r, source: r.source.map(row => ({ ...row, event: { ...row.event, annotation: "forged" } })) }),
    r => ({ ...r, budgets: { ...r.budgets, expandedStates: 100001 } }),
  ];
  for (const mutate of mutations) {
    const f = discoveryApplicationFixture();
    try {
      expect((await f.service.start(mutate(f.request))).ok).toBe(false);
      expect(f.visits).toEqual([]); expect(f.retirementCalls()).toBe(0);
      expect(persistent(f.read())).toEqual(persistent(f.original)); expect(f.read().pendingRequests).toEqual([]);
      for (const arena of f.arenas) expect(arena.inspect().retainedBytes).toBe(0);
    } finally { f.service.dispose(); }
  }
});

test("each corrupted proposal, premise, evidence and cost is independently refused before retirement", async () => {
  const mutations: readonly ((draft: DiscoveryOptionDraft) => DiscoveryOptionDraft)[] = [
    d => ({ ...d, proposal: { kind: "replace-event-annotation", eventId: "foreign", before: "wrong", after: "bad" } }),
    d => ({ ...d, evidence: [] }), d => ({ ...d, evidence: d.evidence.map(row => ({ ...row, statement: "invented premise" })) }),
    d => ({ ...d, counterevidence: [{ kind: "counterevidence", id: "near-miss", statement: "Contradiction", sourceEventIds: [] }] }),
    d => ({ ...d, missingPremises: [{ kind: "missing-premise", id: "absent", statement: "Unknown", sourceEventIds: [] }] }),
    d => ({ ...d, costs: d.costs.map(row => ({ ...row, value: 2 })) }), d => ({ ...d, order: [2] }),
  ];
  for (const mutate of mutations) {
    const f = discoveryApplicationFixture({ draft: () => mutate(annotationDraft()) });
    try {
      expect((await f.service.start(f.request)).ok).toBe(true);
      expect((await f.service.apply("option.0")).kind).toBe("refused"); expect(f.retirementCalls()).toBe(0);
      expect(persistent(f.read())).toEqual(persistent(f.original)); expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
    } finally { f.service.dispose(); }
  }
});

test("selection and engine version changes during retirement cannot reuse a valid earlier check", async () => {
  for (const change of ["selection", "version"]) {
    const retirement = deferred(), f = discoveryApplicationFixture({ retire: () => retirement.promise });
    try {
      await f.service.start(f.request); const applying = f.service.apply("option.0");
      if (change === "selection") f.selected.set("share-event-frozen", "other");
      else Object.defineProperty(f.engine, "version", { value: { id: "finite-protocol", version: "2" } });
      retirement.resolve(true); expect(await applying).toEqual({ kind: "stale" });
      expect(persistent(f.read())).toEqual(persistent(f.original)); expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
    } finally { retirement.resolve(true); f.service.dispose(); }
  }
});

test("A0/F3 reject undeclared changes, invented duration and edits outside the bound sources before retirement", async () => {
  for (const change of ["timing-flag", "undeclared", "document-title", "malformed-shape"]) {
    const publication: DiscoveryPublicationAdapter = { validate: (request, option, current) => {
      const result = annotationPublication.validate(request, option, current);
      if (!result.ok) return result;
      const patch = result.patch;
      if (change === "timing-flag") return { ok: true, patch: { ...patch, exactTimingPreserved: false } };
      if (change === "undeclared") return { ok: true, patch: { ...patch, declaredChangedIds: [] } };
      if (change === "document-title") return { ok: true, patch: { ...patch, candidate: { ...patch.candidate, title: "Unauthorized" } } };
      return { ok: true, patch: { ...patch, candidate: { ...patch.candidate, unexpected: true } } };
    } };
    const f = discoveryApplicationFixture({ publication });
    try {
      await f.service.start(f.request); expect((await f.service.apply("option.0")).kind).toBe("refused");
      expect(f.retirementCalls()).toBe(0); expect(persistent(f.read())).toEqual(persistent(f.original));
      expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
    } finally { f.service.dispose(); }
  }
});

test("a caller-created result with plausible counters cannot enter the private prepared registry", async () => {
  const f = discoveryApplicationFixture({ create: (request, arena) => {
    const real = createDiscoveryStepper(request, arena, discoveryFixtureKernel());
    if (!real.ok) return real;
    return { ok: true, stepper: { ...real.stepper, step: (quantum, cursor) => {
      const next = real.stepper.step(quantum, cursor);
      return next.kind === "yielded" ? next : { kind: "finished", result: { ...next.result,
        counters: { ...next.result.counters, expandedStates: next.result.counters.expandedStates + 1 } } };
    } } };
  } });
  try {
    expect(await f.service.start(f.request)).toEqual({ ok: false, refusal: { code: "discovery.invalid-proof", path: [] } });
    expect((await f.service.apply("option.0")).kind).toBe("refused"); expect(f.retirementCalls()).toBe(0);
    expect(persistent(f.read())).toEqual(persistent(f.original)); expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
  } finally { f.service.dispose(); }
});

test("a source edit or cancellation in the applying subscriber stops before retiring playback and releases all reservations", async () => {
  for (const action of ["edit", "cancel"]) {
    const f = discoveryApplicationFixture();
    try {
      await f.service.start(f.request);
      f.service.subscribe(view => {
        if (view.status !== "applying") return;
        if (action === "edit") f.editTitle("Edit during applying notification"); else f.service.cancel();
      });
      expect((await f.service.apply("option.0")).kind).toBe(action === "edit" ? "stale" : "cancelled");
      expect(f.retirementCalls()).toBe(0); expect(f.read().pendingRequests).toEqual([]);
      expect(f.arenas[0]?.inspect().retainedBytes).toBe(0); expect(f.service.inspect().status).toBe("finished");
    } finally { f.service.dispose(); }
  }
});

test("a throwing decoder after patch capture cannot leak the prepared patch allocation", async () => {
  const f = discoveryApplicationFixture();
  try {
    await f.service.start(f.request);
    Object.defineProperty(f.ports, "dependencies", { value: { ...f.ports.dependencies,
      decodeDocumentShape: () => { throw new Error("Native validation failed unexpectedly"); } } });
    expect((await f.service.apply("option.0")).kind).toBe("refused");
    expect(f.retirementCalls()).toBe(0); expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
    expect(persistent(f.read())).toEqual(persistent(f.original));
  } finally { f.service.dispose(); }
});

test("a publication adapter that changes its patch across the retirement await refuses", async () => {
  let validations = 0;
  const f = discoveryApplicationFixture({ publication: { validate: (request, option, current) => {
    validations += 1;
    const validated = annotationPublication.validate(request, option, current);
    if (!validated.ok || validations === 1) return validated;
    // This is still a valid, exactly scoped A0 annotation edit. It must fail
    // because it differs from the proposal validated before the await.
    const candidate = structuredClone(validated.patch.candidate);
    const event = candidate.sections[0]?.measures[0]?.events[1];
    if (event === undefined) throw new Error("Independent frozen source missing");
    Object.defineProperty(event, "annotation", { value: "A different valid annotation", enumerable: true });
    return { ok: true, patch: { ...validated.patch, candidate } };
  } } });
  try {
    await f.service.start(f.request); expect((await f.service.apply("option.0")).kind).toBe("refused");
    expect(validations).toBe(2); expect(f.retirementCalls()).toBe(1);
    expect(persistent(f.read())).toEqual(persistent(f.original)); expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
  } finally { f.service.dispose(); }
});

test("cancelled or disposed retirement stays charged and blocks another job until the real await settles", async () => {
  for (const action of ["cancel", "dispose"]) {
    const retirement = deferred(), f = discoveryApplicationFixture({ retire: () => retirement.promise });
    try {
      await f.service.start(f.request);
      f.service.subscribe(() => { /* Count a real owned subscription. */ });
      const applying = f.service.apply("option.0");
      expect(f.service.inspect().publicationAttempts).toBe(1);
      if (action === "dispose") f.service.dispose(); else f.service.cancel();
      const view = f.service.inspect();
      expect(view.result).toBe(null); expect(view.openMessagePorts).toBe(0); expect(view.scheduledCallbacks).toBe(0);
      expect(view.publicationAttempts).toBe(1); expect(view.retainedBytes).toBeGreaterThan(0);
      expect(f.arenas[0]?.inspect().retainedBytes).toBe(view.retainedBytes);
      if (action === "dispose") expect(view.listeners).toBe(0);
      expect((await f.service.start(f.request)).ok).toBe(false); expect(f.arenas).toHaveLength(1);
      retirement.resolve(true); expect(await applying).toEqual({ kind: "cancelled" });
      expect(f.service.inspect().retainedBytes).toBe(0); expect(f.service.inspect().publicationAttempts).toBe(0);
      expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
      expect(persistent(f.read())).toEqual(persistent(f.original));
    } finally { retirement.resolve(true); f.service.dispose(); }
  }
});

test("a fully validated bounded-partial option uses the same one-transaction Apply path", async () => {
  const f = discoveryApplicationFixture({ create: (request, arena) => createDiscoveryStepper(request, arena,
    { family: "protocol", maximumWorkspaceBytes: 4096,
      seed: (_request, sink) => { sink.enqueue(() => 0); },
      expand: (_state, _request, sink) => { sink.offer(annotationDraft); sink.enqueue(() => 1); },
    }) });
  try {
    const ready = await f.service.start({ ...f.request, budgets: { ...f.request.budgets, workUnits: 1 } });
    if (!ready.ok) throw new Error(ready.refusal.code);
    expect(ready.result.kind).toBe("bounded-partial"); expect(ready.result.termination).toBe("work-cap");
    expect(await f.service.apply("option.0")).toEqual({ kind: "committed", revision: 6 });
    expect(f.read().history.undo).toHaveLength(3); expect(f.arenas[0]?.inspect().retainedBytes).toBe(0);
  } finally { f.service.dispose(); }
});
