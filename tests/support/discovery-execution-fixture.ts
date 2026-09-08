import { parseStableId } from "../../src/domain";
import type { DiscoveryBudgets, DiscoveryCursor, DiscoveryOptionDraft, DiscoveryRequest, DiscoveryResult, DiscoveryStepper } from "../../src/theory/discovery-execution-contract";
import type { DiscoveryEnumerationKernel } from "../../src/theory/discovery-execution";
import laws from "../fixtures/discovery-execution/law-cases.json";

export function discoveryRequest(budgets: Partial<DiscoveryBudgets> = {}): DiscoveryRequest {
  const id = parseStableId("document", "discovery-fixture-document");
  if (!id.ok) throw new Error("Independent document ID refused");
  return {
    schema: "changes.discovery-execution.v1",
    identity: { requestId: "fixture.1", documentId: id.value, sourceRevision: 5,
      engine: { id: "finite-protocol", version: "1" }, policy: { id: "literal-order", version: "1" },
      laws: [], corpora: [], seed: null },
    source: [], constraints: null, input: null,
    budgets: { expandedStates: 100000, generatedCandidates: 8388608, retainedOptions: 128,
      queuedStates: 100000, outgoingPerState: 128, depth: 256, workUnits: 8388608,
      trackedBytes: 67108864, ...budgets },
  };
}

export function discoveryDraft(value: number, order = value): DiscoveryOptionDraft {
  return { value, proposal: null, evidence: [], counterevidence: [], missingPremises: [],
    costs: [{ id: "fixture-rank", family: "complexity", unit: "rank", direction: "minimize", value: order, target: null }], order: [order] };
}

export function discoveryFixtureKernel(fixture = laws.enumerations[0], visited: string[] = []): DiscoveryEnumerationKernel {
  if (fixture === undefined) throw new Error("Independent enumeration missing");
  return { family: "protocol", maximumWorkspaceBytes: 4096,
    seed: (_request, sink) => { for (const id of fixture.seeds) if (!sink.enqueue(() => id)) break; },
    expand: (state, _request, sink) => {
      if (typeof state !== "string") throw new Error("Invalid fixture state");
      visited.push(state);
      const node = fixture.nodes.find(row => row.id === state);
      if (node === undefined) throw new Error("Unknown fixture state");
      for (const next of node.next) if (!sink.enqueue(() => next)) break;
      if (node.value !== null) sink.offer(() => discoveryDraft(node.value, node.order));
    },
  };
}

export function finishDiscovery(stepper: DiscoveryStepper, schedule: readonly number[] = [1024]): DiscoveryResult {
  let cursor: DiscoveryCursor | null = null;
  for (let index = 0; index < 100000; index += 1) {
    const quantum = schedule[index % schedule.length];
    if (quantum === undefined) throw new Error("Empty test schedule");
    const advance = stepper.step(quantum, cursor);
    if (advance.kind === "finished") return advance.result;
    cursor = advance.cursor;
  }
  throw new Error("Fixture did not terminate");
}
