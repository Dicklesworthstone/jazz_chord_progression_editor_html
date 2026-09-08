import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import publicationSource from "../tests/fixtures/exact-share/document.changes.json";
import contract from "../tests/fixtures/discovery-execution/contract.json";
import laws from "../tests/fixtures/discovery-execution/law-cases.json";
import limits from "../tests/fixtures/discovery-execution/limit-cases.json";
import mutations from "../tests/fixtures/discovery-execution/mutation-controls.json";
import provenance from "../tests/fixtures/discovery-execution/provenance.json";
import traces from "../tests/fixtures/discovery-execution/trace-ledger.json";

/** Independent fixture arithmetic only; never imports production search. */
export const discoveryFixturePacket = { contract, laws, limits, mutations, provenance, traces };
export type DiscoveryFixturePacket = typeof discoveryFixturePacket;
type Enumeration = (typeof laws.enumerations)[number];

export function enumerateDiscoveryFixture(scene: Enumeration, workCap = 8_388_608) {
  const queue = scene.seeds.map(id => ({ id, depth: 0 }));
  const visited: string[] = [];
  const candidates: { value: number; order: number }[] = [];
  let peakQueuedStates = queue.length, depthReached = 0;
  while (queue.length > 0 && visited.length < workCap) {
    const item = queue.shift();
    if (item === undefined) throw new Error("Independent FIFO lost a queued node");
    const node = scene.nodes.find(row => row.id === item.id);
    if (node === undefined) throw new Error(`Missing fixture node ${item.id}`);
    visited.push(item.id);
    depthReached = Math.max(depthReached, item.depth);
    if (node.value !== null) candidates.push({ value: node.value, order: node.order });
    for (const id of node.next) queue.push({ id, depth: item.depth + 1 });
    peakQueuedStates = Math.max(peakQueuedStates, queue.length);
  }
  const ordered = candidates.sort((a, b) => a.order - b.order ||
    (String(a.value) < String(b.value) ? -1 : String(a.value) > String(b.value) ? 1 : 0));
  const options = ordered.filter((row, i) => i === 0 || row.value !== ordered[i - 1]?.value || row.order !== ordered[i - 1]?.order).map(row => row.value);
  return { visited, options, optionIds: options.map((_, i) => `option.${String(i)}`),
    expandedStates: visited.length, workUnits: visited.length,
    workQuanta: Math.ceil(visited.length / 64), generatedCandidates: candidates.length,
    retainedOptions: options.length, peakQueuedStates, depthReached,
    kind: queue.length > 0 ? "bounded-partial" : options.length > 0 ? "complete" : "no-result",
    termination: queue.length > 0 ? "work-cap" : "complete" };
}

/** All positive integral compositions, independent of a future stepper. */
export function discoveryQuantumPartitions(units: number): readonly (readonly number[])[] {
  if (!Number.isInteger(units) || units < 0 || units > 16) {
    throw new Error("Independent partition oracle supports only 0..16 units");
  }
  if (units === 0) return [[]];
  const result: number[][] = [];
  for (let first = 1; first <= units; first += 1) {
    for (const rest of discoveryQuantumPartitions(units - first)) result.push([first, ...rest]);
  }
  return result;
}

export function discoveryFixtureCharge(value: unknown, seen = new Set<object>()): number {
  if (typeof value === "string") return 8 + 2 * value.length;
  if (value === null || typeof value !== "object") return 8;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) return 32 + value.reduce<number>((sum, item: unknown) =>
    sum + discoveryFixtureCharge(item, seen) + (item !== null && typeof item === "object" ? 8 : 0), 0);
  return 32 + Object.entries(value).reduce((sum, [key, item]: [string, unknown]) =>
    sum + 8 + key.length * 2 + discoveryFixtureCharge(item, seen) +
    (item !== null && typeof item === "object" ? 8 : 0), 0);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]: [string, unknown]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

export function validateDiscoveryExecutionContract(packet: DiscoveryFixturePacket = discoveryFixturePacket) {
  const findings: { code: string; detail: string }[] = [];
  const check = (condition: boolean, code: string, detail: string): void => {
    if (!condition) findings.push({ code, detail });
  };
  const equal = (actual: unknown, expected: unknown, code: string, detail: string): void => {
    check(canonical(actual) === canonical(expected), code, detail);
  };
  equal(packet.contract.schema, "changes.fixtures.discovery-execution.v1", "schema", "contract");
  check(packet.contract.status === "specified-not-implemented" && !packet.contract.productionOutputUsed,
    "authority", "Specification cannot claim runtime output as evidence");
  equal(packet.contract.companions, ["law-cases.json", "limit-cases.json", "mutation-controls.json", "provenance.json", "trace-ledger.json"], "companions", "Exact independent inventory");
  equal(packet.contract.resultKinds, ["complete", "no-result", "bounded-partial", "refused", "cancelled", "stale"], "terminal", "Closed outcomes");
  equal(packet.contract.limitPrecedence, ["work-cap", "state-cap", "candidate-cap", "option-cap", "queue-cap", "outgoing-cap", "depth-cap", "memory-cap", "result-byte-cap"], "limits", "Deterministic simultaneous-limit precedence");
  equal(packet.contract.memoryCharges, { primitiveOrReference: 8, containerHeader: 32, stringCodeUnit: 2 }, "memory", "Declared ownership model");
  equal(packet.contract.engineCeilings, {
    H1: { sourceEvents:64, lawsPerCandidate:16, patchOperations:32 },
    G0: { sourceEvents:256, retainedOptions:5 },
    G2: { sourceEvents:8, candidatesPerProvider:32, retainedOptions:16 },
    G3: { routeEvents:8, outgoingPerState:64, expandedStates:50_000, retainedOptions:8, trackedBytes:67_108_864 },
    G4: { slots:16, candidatesPerSlot:128, expandedStates:100_000 },
    G5: { depth:3, outgoingPerState:8, canonicalNodes:128 },
  }, "engine-cap", "Accepted plan/H1 ceilings");
  const limitMap = new Map<string, number>(Object.entries(packet.contract.limits));
  const edgeNames = packet.limits.edges.map(row => row.resource).sort();
  equal(edgeNames, [...limitMap.keys()].filter(key => !["stepMinimum", "workUnitsPerSemanticQuantum"].includes(key)).sort(), "limits", "Every maximum has one edge witness");
  for (const row of packet.limits.edges) {
    equal([row.below, row.at, row.over], [row.maximum - 1, row.maximum, row.maximum + 1], "limits", row.id);
    check(Number.isSafeInteger(row.maximum) && row.maximum > 0 && limitMap.get(row.resource) === row.maximum,
      "limits", row.id);
    equal(row.expected, ["admit", "admit", "refuse-before-operation"], "limits", row.id);
  }
  for (const row of packet.limits.quantumCases) check(row.valid === (Number.isInteger(row.value) && row.value >= 1 && row.value <= 1024), "quantum", String(row.value));
  for (const row of packet.limits.budgetCases) check(row.valid === (Number.isSafeInteger(row.value) && row.value >= 0), "budget", String(row.value));
  for (const row of packet.laws.enumerations) {
    const actual = enumerateDiscoveryFixture(row);
    equal(actual, row.expected, "enumeration", row.id);
    // Every split of the work count is a legal schedule: sum, never call count.
    for (const partition of discoveryQuantumPartitions(actual.workUnits)) {
      check(partition.reduce((sum, value) => sum + value, 0) === actual.workUnits, "partition", row.id);
    }
  }
  const tree = packet.laws.enumerations.find(row => row.id === "DE-TREE");
  if (tree === undefined) findings.push({ code: "enumeration", detail: "DE-TREE missing" });
  else for (const prefix of packet.laws.prefixes) {
    const actual = enumerateDiscoveryFixture(tree, prefix.workCap);
    equal([actual.visited, actual.options, actual.kind, actual.termination],
      [prefix.visited, prefix.options, prefix.kind, prefix.termination], "prefix", prefix.id);
  }
  for (const row of packet.laws.semanticQuanta) check(Math.ceil(row.work / 64) === row.expected, "quantum", String(row.work));
  for (const row of packet.laws.times) {
    const numerator = row.before[0], denominator = row.before[1];
    if (numerator === undefined || denominator === undefined) throw new Error("Invalid literal fraction");
    let n = 0n, d = 1n;
    for (const part of row.after) {
      const a = part[0], b = part[1];
      if (a === undefined || b === undefined) throw new Error("Invalid literal part");
      n = n * BigInt(b) + BigInt(a) * d; d *= BigInt(b);
    }
    check((n * BigInt(denominator) === BigInt(numerator) * d) === row.preserved, "time", row.id);
    if (row.representable !== undefined) check(row.after.every(part =>
      part[1] !== undefined && 960 % part[1] === 0) === row.representable, "time-grid", row.id);
  }
  for (const row of packet.laws.storedPitches) check((canonical(row.before) === canonical(row.after)) === row.unchanged, "stored-pitches", row.id);
  for (const row of packet.laws.memory) check(discoveryFixtureCharge(row.value) === row.chargedBytes, "memory", row.id);
  const source = packet.laws.publicationSource;
  equal(source.path, "tests/fixtures/exact-share/document.changes.json", "source", "Existing independent Manual/Frozen source");
  equal(source.sha256, createHash("sha256").update(readFileSync(resolve(import.meta.dirname, "../tests/fixtures/exact-share/document.changes.json"))).digest("hex"), "source", "Exact source bytes");
  equal(source.documentId, publicationSource.id, "source", "Source document identity");
  equal(source.selectedRealizations, { "share-event-manual": "custom", "share-event-frozen": "literal" }, "source", "Exact T1 selection");
  equal(source.positions, [{ eventId: "share-event-manual", numerator: 0, denominator: 1 },
    { eventId: "share-event-frozen", numerator: 5, denominator: 3 }], "source", "Exact source positions");
  equal(source.expectedAfterApply, { revision: source.revision + 1, historyEntries: source.historyEntries + 1,
    savedRevision: source.savedRevision, exportedRevision: source.exportedRevision, pitchAndTimeBytesUnchanged: true }, "source", "One real A0 publication");
  equal(source.expectedAfterUndo, { revision: source.revision + 2, historyEntries: source.historyEntries,
    originalDocumentBytesRestored: true }, "source", "Undo preserves monotonic revision");
  equal(source.positiveProposal, { kind: "replace-event-annotation", eventId: "share-event-frozen",
    before: "Do not optimize this inversion.", after: "Keep the written line." }, "source", "Finite protocol publication, not a musical engine claim");
  equal([...new Set(packet.limits.terminalCases.map(row => row.kind))].sort(), [...packet.contract.resultKinds].sort(), "terminal", "All outcomes have cases");
  for (const row of packet.limits.terminalCases) {
    check(row.kind === "complete" ? row.options > 0 && row.termination === "complete" :
      row.kind === "no-result" ? row.options === 0 && row.termination === "complete" :
      row.kind === "bounded-partial" ? packet.contract.limitPrecedence.includes(row.termination) :
      row.options === 0 && row.termination === row.kind, "terminal", row.case);
  }
  equal(packet.limits.authorityCorruptions, ["requestId", "documentId", "sourceRevision", "engineVersion", "policyVersion", "lawVersion", "corpusVersion", "seed", "constraints", "sourceEventId", "selectedRealizationId", "sourceSpelling", "duration", "manualPitchOrder", "frozenDuplicate", "candidateId", "proposal", "evidencePremise", "counter", "cursor", "registryMembership"], "authority", "Each corruption gets an unchanged-state refusal twin");
  check(!packet.provenance.runtimeImplementationClaim && !packet.provenance.engineCompletenessClaim &&
    !packet.provenance.humanListeningPerformed && packet.provenance.records.every(row => !row.productionOutputUsed), "authority", "No self-certification");
  equal(packet.provenance.records.map(row => row.id).sort(), ["DE-APPLICATION", "DE-ARITHMETIC", "DE-LIMITS", "DE-PLAN"], "authority", "Provenance inventory");
  const authorityIds = new Set(packet.provenance.records.map(row => row.id));
  for (const row of packet.traces.traces) check(authorityIds.has(row.authority) && row.observations.length >= 5, "trace", row.id);
  equal(packet.traces.traces.map(row => row.owner).sort(), ["tests/unit/discovery-execution.test.ts", "tests/conformance/discovery-execution.test.ts", "tests/property/discovery-execution.test.ts", "tests/integration/discovery-execution.test.ts", "tests/e2e/discovery-execution.spec.ts"].sort(), "trace", "Future runtime proof inventory");
  const apply = packet.traces.publicationTraces.find(row => row.id === "DE-APPLY-UNDO");
  equal(apply?.actions, ["start", "complete", "validate", "retire", "revalidate", "apply", "undo"], "trace", "Retirement and revalidation precede one A0 command");
  equal([apply?.commits, apply?.historyAfterApply, apply?.revisionAfterApply, apply?.revisionAfterUndo, apply?.originalRestored], [1, 1, 1, 2, true], "trace", "Exact Apply/Undo transitions");
  check(packet.mutations.controls.length === 16 && new Set(packet.mutations.controls.map(row => row.target)).size === 16 &&
    packet.mutations.controls.every(row => row.expected === "reject"), "mutation", "Sixteen specification fault controls");
  return { schema: "changes.validation.discovery-execution-contract.v1", outcome: findings.length === 0 ? "pass" : "fail",
    runtimeImplementationClaim: false, counts: { enumerations: packet.laws.enumerations.length,
      maximumEdges: packet.limits.edges.length, authorityCorruptions: packet.limits.authorityCorruptions.length,
      mutations: packet.mutations.controls.length, traces: packet.traces.traces.length }, findings };
}

if (import.meta.main) {
  const report = validateDiscoveryExecutionContract();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}
