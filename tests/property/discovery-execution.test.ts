import { expect, test } from "bun:test";
import { addBeatValues, makeBeatPosition } from "../../src/domain";
import { redoDocumentCommand, undoDocumentCommand } from "../../src/application";
import { createDiscoveryArena, createDiscoveryStepper } from "../../src/theory";
import { a0InitialState, publishA0Candidate } from "../support/a0-application-fixture";
import { discoveryApplicationFixture } from "../support/discovery-application-fixture";
import { discoveryFixtureKernel, finishDiscovery } from "../support/discovery-execution-fixture";

for (const action of ["edit", "undo", "undo-redo", "replace", "recovery", "selection"] as const) {
  for (const cut of [0, 1, 2]) test(`${action} after ${String(cut)} real yields invalidates the captured source without a discovery edit`, async () => {
    const f = discoveryApplicationFixture();
    let observed = f.original;
    try {
      const unsubscribe = f.service.subscribe(view => {
        if (view.status !== "running" || view.yields !== cut) return;
        unsubscribe();
        if (action === "edit") f.editTitle("User edit during search");
        else if (action === "undo" || action === "undo-redo") {
          const undone = undoDocumentCommand({ state: f.read() });
          if (!undone.ok) throw new Error(undone.refusal.code);
          f.write(undone.state);
          if (action === "undo-redo") {
            const redone = redoDocumentCommand({ state: f.read() });
            if (!redone.ok) throw new Error(redone.refusal.code);
            f.write(redone.state);
          }
        } else if (action === "selection") f.selected.set("share-event-frozen", "other");
        else {
          // A new validated A0 session is the source-owner publication boundary
          // consumed here. This does not claim to test the IDB/import adapters.
          const candidate = { ...f.read().document, id: action === "replace" ? "new-document" : f.read().document.id };
          f.write(a0InitialState(publishA0Candidate(candidate)));
        }
        observed = f.read();
      });
      const result = await f.service.start(f.request);
      if (!result.ok) throw new Error(result.refusal.code);
      expect(result.result.kind).toBe("stale"); expect(result.result.options).toEqual([]);
      expect(f.visits).toEqual(Array.from({ length: cut }, (_, i) => i));
      expect(f.read().document).toBe(observed.document); expect(f.read().history).toBe(observed.history);
      expect(f.read().revision).toBe(observed.revision); expect(f.read().recovery).toBe(observed.recovery);
      expect(f.read().exportRevision).toBe(observed.exportRevision); expect(f.retirementCalls()).toBe(0);
      expect(f.read().pendingRequests).toEqual([]); expect(f.service.inspect().openMessagePorts).toBe(0);
      expect(f.service.inspect().retainedBytes).toBe(0); expect(f.service.inspect().scheduledCallbacks).toBe(0);
      if (action === "undo-redo") expect(f.read().document).toEqual(f.original.document);
    } finally { f.service.dispose(); }
  });
}

test("written source, exact duration and Manual/Frozen corruption each refuse before scheduling", async () => {
  for (const mutation of ["spelling", "duration", "manual-order", "frozen-duplicate", "source-id", "position"] as const) {
    const f = discoveryApplicationFixture();
    try {
      const request = structuredClone(f.request);
      const source = request.source[mutation === "frozen-duplicate" ? 1 : 0];
      if (source === undefined) throw new Error("Independent source missing");
      if (mutation === "spelling") Object.defineProperty(source.event.chord, "sourceText", { value: "C7" });
      else if (mutation === "duration") Object.defineProperty(source.event, "duration", { value: { numerator: 8, denominator: 3 } });
      else if (mutation === "source-id") Object.defineProperty(source.event, "id", { value: "foreign-source" });
      else if (mutation === "position") Object.defineProperty(source, "position", { value: { numerator: 1, denominator: 1 } });
      else {
        const voicing = source.event.voicing;
        if (voicing.mode === "auto") throw new Error("Independent stored-pitch fixture changed");
        Object.defineProperty(voicing, "pitches", { value: mutation === "manual-order" ? [...voicing.pitches].reverse() : [...voicing.pitches, voicing.pitches[0]] });
      }
      expect((await f.service.start(request)).ok).toBe(false);
      expect(f.visits).toEqual([]); expect(f.read().document).toBe(f.original.document);
      expect(f.read().history).toBe(f.original.history); expect(f.read().pendingRequests).toEqual([]);
      expect(f.service.inspect().retainedBytes).toBe(0); expect(f.retirementCalls()).toBe(0);
    } finally { f.service.dispose(); }
  }
});

test("exact rational coordinate translations preserve selected-source gaps and enumeration", () => {
  const f = discoveryApplicationFixture();
  try {
    for (let offset = 0; offset < 12; offset += 1) {
      const translation = makeBeatPosition({ numerator: 7 * offset, denominator: 3 });
      if (!translation.ok) throw new Error("Independent rational offset invalid");
      const source = f.request.source.map(row => {
        const sum = addBeatValues(row.position, translation.value);
        if (!sum.ok) throw new Error("Independent exact sum invalid");
        const position = makeBeatPosition(sum.value);
        if (!position.ok) throw new Error("Independent exact position invalid");
        return { ...row, position: position.value };
      });
      const request = { ...f.request, source }, arena = createDiscoveryArena(67108864);
      if (arena === null) throw new Error("Literal arena refused");
      const created = createDiscoveryStepper(request, arena, discoveryFixtureKernel());
      if (!created.ok) throw new Error(created.refusal.code);
      const result = finishDiscovery(created.stepper, [1, 2, 3]);
      expect(result.kind).toBe("complete"); expect(result.options.map(row => row.value)).toEqual([1, 4, 9]);
      expect(result.counters.workUnits).toBe(6); expect(result.request.source).toEqual(source);
      expect(result.request.source.map(row => row.event)).toEqual(f.request.source.map(row => row.event));
      created.stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
    }
  } finally { f.service.dispose(); }
});
