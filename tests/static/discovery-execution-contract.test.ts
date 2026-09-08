import { expect, test } from "bun:test";
import {
  DISCOVERY_EXECUTION_SCHEMA, DISCOVERY_EXECUTION_SPECIFICATION_STATUS,
  DISCOVERY_EXECUTION_LIMITS, DISCOVERY_ENGINE_CEILINGS,
} from "../../src/theory/discovery-execution-contract";
import {
  discoveryFixturePacket, discoveryFixtureCharge, discoveryQuantumPartitions,
  enumerateDiscoveryFixture, validateDiscoveryExecutionContract,
  type DiscoveryFixturePacket,
} from "../../scripts/validate-discovery-execution-contract";

test("independent packet freezes the complete additive execution contract", () => {
  const report = validateDiscoveryExecutionContract();
  expect(report.findings).toEqual([]);
  expect(report.outcome).toBe("pass");
  expect(report.runtimeImplementationClaim).toBe(false);
  expect(report.counts).toEqual({ enumerations: 3, maximumEdges: 26,
    authorityCorruptions: 21, mutations: 16, traces: 5 });
  expect(DISCOVERY_EXECUTION_SCHEMA).toBe("changes.discovery-execution.v1");
  expect(DISCOVERY_EXECUTION_SPECIFICATION_STATUS).toBe("specified-not-implemented");
  expect(discoveryFixturePacket.contract.limits).toEqual(DISCOVERY_EXECUTION_LIMITS);
  expect(discoveryFixturePacket.contract.engineCeilings).toEqual(DISCOVERY_ENGINE_CEILINGS);
});

test("every partition of six literal expansions has the same final semantics", () => {
  const tree = discoveryFixturePacket.laws.enumerations[0];
  if (tree === undefined) throw new Error("Missing independent tree");
  // Independent bit-mask enumeration of cuts, not the validator recurrence.
  const expected: number[][] = [];
  for (let mask = 0; mask < 32; mask += 1) {
    const parts: number[] = []; let size = 0;
    for (let position = 0; position < 6; position += 1) {
      size += 1;
      if (position === 5 || (mask & (1 << position)) !== 0) { parts.push(size); size = 0; }
    }
    expected.push(parts);
  }
  expect(discoveryQuantumPartitions(6).map(parts => JSON.stringify(parts)).sort())
    .toEqual(expected.map(parts => JSON.stringify(parts)).sort());
  for (const schedule of [...expected, ...discoveryFixturePacket.laws.quantumSchedules]) {
    let work = 0;
    for (const quantum of schedule) work += quantum;
    expect(enumerateDiscoveryFixture(tree, work)).toEqual(tree.expected);
  }
});

test("zero work is partial, exact exhausted work is complete, and duplicate emissions count", () => {
  const tree = discoveryFixturePacket.laws.enumerations[0];
  if (tree === undefined) throw new Error("Missing independent tree");
  expect(enumerateDiscoveryFixture(tree, 0)).toMatchObject({ kind: "bounded-partial", workUnits: 0, options: [] });
  expect(enumerateDiscoveryFixture(tree, 3)).toMatchObject({ kind: "bounded-partial", workUnits: 3, options: [4] });
  expect(enumerateDiscoveryFixture(tree, 6)).toMatchObject({ kind: "complete", workUnits: 6,
    generatedCandidates: 4, retainedOptions: 3, peakQueuedStates: 4 });
});

test("shared snapshots are charged once with both retained references counted", () => {
  const shared = [1];
  expect(discoveryFixtureCharge([shared, shared])).toBe(88);
  expect(discoveryFixtureCharge([[1], [1]])).toBe(128);
});

test("publication source corruption cannot silently alter the accepted packet", () => {
  for (const field of ["sha256", "documentId"] as const) {
    const changed = structuredClone(discoveryFixturePacket);
    changed.laws.publicationSource[field] = "wrong";
    expect(validateDiscoveryExecutionContract(changed).outcome).toBe("fail");
  }
  const changed = structuredClone(discoveryFixturePacket);
  changed.laws.publicationSource.selectedRealizations["share-event-frozen"] = "alt-b9-b5";
  expect(validateDiscoveryExecutionContract(changed).outcome).toBe("fail");
});

const changes: Readonly<Record<string, (packet: DiscoveryFixturePacket) => void>> = {
  "work-count": p => { const row = p.laws.enumerations[0]; if (row !== undefined) row.expected.workUnits = 5; },
  "queue-peak": p => { const row = p.laws.enumerations[0]; if (row !== undefined) row.expected.peakQueuedStates = 6; },
  "tie-order": p => { const row = p.laws.enumerations[0]; if (row !== undefined) row.expected.options = [4, 1, 9]; },
  "generated-count": p => { const row = p.laws.enumerations[0]; if (row !== undefined) row.expected.generatedCandidates = 3; },
  "scheduler-quanta": p => { const row = p.laws.semanticQuanta.find(r => r.work === 65); if (row !== undefined) row.expected = 1; },
  "empty-complete": p => { const row = p.laws.enumerations.find(r => r.id === "DE-EMPTY"); if (row !== undefined) row.expected.kind = "complete"; },
  "exact-bound": p => { const row = p.laws.prefixes.find(r => r.workCap === 6); if (row !== undefined) row.kind = "bounded-partial"; },
  "invented-time": p => { const row = p.laws.times.find(r => r.id === "DE-INVENTED-TIME"); if (row !== undefined) row.preserved = true; },
  "stored-order": p => { const row = p.laws.storedPitches.find(r => r.id === "DE-MANUAL-SORT"); if (row !== undefined) row.unchanged = true; },
  "memory-charge": p => { const row = p.laws.memory.find(r => r.id === "DE-NESTED"); if (row !== undefined) row.chargedBytes = 50; },
  "over-admitted": p => { const row = p.limits.edges[0]; if (row !== undefined) row.expected[2] = "admit"; },
  "engine-cap": p => { p.contract.engineCeilings.G3.expandedStates = 50_001; },
  "cancel-options": p => { const row = p.limits.terminalCases.find(r => r.kind === "cancelled"); if (row !== undefined) row.options = 1; },
  "missing-retirement": p => { const row = p.traces.publicationTraces[0]; if (row !== undefined) row.actions = row.actions.filter(action => action !== "retire"); },
  "missing-premise-binding": p => { p.limits.authorityCorruptions = p.limits.authorityCorruptions.filter(field => field !== "selectedRealizationId"); },
  "self-certified": p => { p.provenance.runtimeImplementationClaim = true; },
};

for (const control of discoveryFixturePacket.mutations.controls) {
  test(`independent specification mutation rejects ${control.id}: ${control.observedDefect}`, () => {
    const mutate = changes[control.target];
    expect(mutate).toBeDefined();
    const changed = structuredClone(discoveryFixturePacket);
    mutate?.(changed);
    expect(changed).not.toEqual(discoveryFixturePacket);
    const report = validateDiscoveryExecutionContract(changed);
    expect(report.outcome).toBe("fail");
    expect(report.findings.length).toBeGreaterThan(0);
  });
}

test("mutation inventory is exhaustive for the declared specification faults", () => {
  expect(Object.keys(changes).sort()).toEqual(discoveryFixturePacket.mutations.controls.map(row => row.target).sort());
});
