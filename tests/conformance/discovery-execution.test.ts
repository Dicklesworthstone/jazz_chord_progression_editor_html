import { expect, test } from "bun:test";
import { captureDiscoveryValue, createDiscoveryArena, createDiscoveryStepper,
  type DiscoveryBudgets, type DiscoveryOptionDraft, type DiscoveryRequest } from "../../src/theory";
import { discoveryDraft, discoveryFixtureKernel, discoveryRequest, finishDiscovery } from "../support/discovery-execution-fixture";
import { discoveryApplicationFixture } from "../support/discovery-application-fixture";
import { makeBeatPosition, parseStableId } from "../../src/domain";

function admit(request: DiscoveryRequest) {
  const arena = createDiscoveryArena(request.budgets.trackedBytes);
  if (arena === null) throw new Error("Independent arena limit invalid");
  const created = createDiscoveryStepper(request, arena, discoveryFixtureKernel());
  if (created.ok) created.stepper.dispose();
  expect(arena.inspect().retainedBytes).toBe(0);
  return created.ok;
}

const maxima: Readonly<Record<keyof DiscoveryBudgets, number>> = {
  expandedStates: 100000, generatedCandidates: 8388608, retainedOptions: 128,
  queuedStates: 100000, outgoingPerState: 128, depth: 256, workUnits: 8388608,
  trackedBytes: 67108864,
};
for (const [key, maximum] of Object.entries(maxima)) test(`${key}: admission enforces the independently frozen maximum`, () => {
  for (const value of [maximum - 1, maximum, maximum + 1, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const request = discoveryRequest();
    Object.defineProperty(request.budgets, key, { value, enumerable: true });
    if (key === "trackedBytes" && (value > maximum || value < 0 || !Number.isSafeInteger(value))) {
      expect(createDiscoveryArena(value)).toBe(null);
    } else expect(admit(request)).toBe(Number.isSafeInteger(value) && value >= 0 && value <= maximum);
  }
});

for (const size of [255, 256, 257]) test(`sourceEvents admits exactly the closed256-event envelope: ${String(size)}`, () => {
  const f = discoveryApplicationFixture();
  try {
    const source = f.request.source[0];
    if (source === undefined) throw new Error("Independent source missing");
    const request: DiscoveryRequest = { ...discoveryRequest(), source: Array.from({ length: size }, (_, i) => {
      const id = parseStableId("event", `source.${String(i)}`);
      const position = makeBeatPosition({ numerator: 5 * i, denominator: 3 });
      if (!id.ok || !position.ok) throw new Error("Literal source ID/position invalid");
      return { ...source, position: position.value, event: { ...source.event, id: id.value } };
    }) };
    expect(admit(request)).toBe(size <= 256);
  } finally { f.service.dispose(); }
});

test("pure admission rejects overlapping or reversed source spans while allowing an exact selected-range gap", () => {
  const f = discoveryApplicationFixture();
  try {
    const first = f.request.source[0], second = f.request.source[1];
    const gap = makeBeatPosition({ numerator: 2, denominator: 1 });
    if (first === undefined || second === undefined || !gap.ok) throw new Error("Independent timeline missing");
    expect(admit(f.request)).toBe(true);
    expect(admit({ ...f.request, source: [first, { ...second, position: gap.value }] })).toBe(true);
    expect(admit({ ...f.request, source: [first, { ...second, position: first.position }] })).toBe(false);
    expect(admit({ ...f.request, source: [second, first] })).toBe(false);
  } finally { f.service.dispose(); }
});

for (const size of [127, 128, 129]) test(`identityCodeUnits follows the literal128-character boundary: ${String(size)}`, () => {
  const request = discoveryRequest();
  expect(admit({ ...request, identity: { ...request.identity, requestId: "r".repeat(size) } })).toBe(size <= 128);
});
for (const size of [63, 64, 65]) test(`version sets are bounded, closed and canonically ordered: ${String(size)}`, () => {
  const request = discoveryRequest();
  const versions = Array.from({ length: size }, (_, i) => ({ id: `law.${String(i).padStart(3, "0")}`, version: "1" }));
  expect(admit({ ...request, identity: { ...request.identity, laws: versions } })).toBe(size <= 64);
  expect(admit({ ...request, identity: { ...request.identity, corpora: versions } })).toBe(size <= 64);
  expect(admit({ ...request, identity: { ...request.identity, laws: [...versions].reverse() } })).toBe(false);
});

/** Build exact JSON wire lengths without using the production encoder. */
function wirePayload(bytes: number): readonly string[] {
  const chunks: string[] = []; let remaining = bytes - 2;
  while (remaining > 0) {
    const overhead = chunks.length === 0 ? 2 : 3;
    const budget = Math.min(remaining - overhead, 65530 * 6);
    const controls = Math.floor(budget / 6), ascii = budget % 6;
    const text = "\u0001".repeat(controls) + "x".repeat(ascii);
    chunks.push(text); remaining -= overhead + controls * 6 + ascii;
  }
  expect(new TextEncoder().encode(JSON.stringify(chunks)).byteLength).toBe(bytes);
  return chunks;
}
for (const maximum of [4194304, 8388608]) test(`passive canonical UTF-8 boundary ${String(maximum)} is exact, not string length`, () => {
  for (const bytes of [maximum - 1, maximum, maximum + 1]) {
    const arena = createDiscoveryArena(67108864);
    if (arena === null) throw new Error("Literal arena refused");
    const captured = captureDiscoveryValue(wirePayload(bytes), arena, maximum);
    expect(captured.ok).toBe(bytes <= maximum);
    if (captured.ok) { expect(captured.value.bytes).toBe(bytes); arena.release(captured.value.reservation); }
    expect(arena.inspect().retainedBytes).toBe(0);
  }
});

test("data depth, node count and text limits have independent maximum and one-over witnesses", () => {
  for (const depth of [31, 32, 33]) {
    let value: unknown = null;
    for (let i = 0; i < depth; i += 1) value = [value];
    const arena = createDiscoveryArena(67108864);
    if (arena === null) throw new Error("Literal arena refused");
    const captured = captureDiscoveryValue(value, arena);
    expect(captured.ok).toBe(depth <= 32);
    if (captured.ok) arena.release(captured.value.reservation);
  }
  for (const nodes of [262143, 262144, 262145]) {
    const arena = createDiscoveryArena(67108864);
    if (arena === null) throw new Error("Literal arena refused");
    const captured = captureDiscoveryValue(Array.from({ length: nodes - 1 }, () => 0), arena);
    expect(captured.ok).toBe(nodes <= 262144);
    if (captured.ok) arena.release(captured.value.reservation);
  }
  for (const units of [65535, 65536, 65537]) {
    const arena = createDiscoveryArena(67108864);
    if (arena === null) throw new Error("Literal arena refused");
    const captured = captureDiscoveryValue("x".repeat(units), arena);
    expect(captured.ok).toBe(units <= 65536);
    if (captured.ok) arena.release(captured.value.reservation);
  }
});

for (const lane of ["evidence", "counterevidence", "missingPremises", "costs"] as const) test(`${lane} is bounded at its own emission site`, () => {
  const maximum = lane === "costs" ? 16 : 128;
  for (const length of [maximum - 1, maximum, maximum + 1]) {
    const arena = createDiscoveryArena(67108864);
    if (arena === null) throw new Error("Literal arena refused");
    const draft: DiscoveryOptionDraft = lane === "costs" ? { ...discoveryDraft(1),
      costs: Array.from({ length }, (_, i) => ({ id: `cost.${String(i)}`, family: "complexity", unit: "count", direction: "minimize", value: i, target: null })) } :
      { ...discoveryDraft(1), [lane]: Array.from({ length }, (_, i) => ({ kind: "context", id: `evidence.${String(i)}`, statement: "Literal protocol premise", sourceEventIds: [] })) };
    const created = createDiscoveryStepper(discoveryRequest(), arena, { family: "protocol", maximumWorkspaceBytes: 262144,
      seed: (_request, sink) => { sink.enqueue(() => 0); }, expand: (_state, _request, sink) => { sink.offer(() => draft); } });
    if (!created.ok) throw new Error(created.refusal.code);
    expect(finishDiscovery(created.stepper).kind).toBe(length <= maximum ? "complete" : "refused");
    created.stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
  }
});

test("actual container peaks obey independent small-cap exhaustive enumeration", () => {
  for (let cap = 1; cap <= 9; cap += 1) {
    const arena = createDiscoveryArena(67108864);
    if (arena === null) throw new Error("Literal arena refused");
    let produced = 0;
    const created = createDiscoveryStepper(discoveryRequest({ queuedStates: cap }), arena, {
      family: "protocol", maximumWorkspaceBytes: 65536,
      seed: (_request, sink) => {
        for (let i = 0; i < cap + 1; i += 1) if (!sink.enqueue(() => { produced += 1; return i; })) break;
      }, expand: () => { throw new Error("A refused initialization queue must not expand"); },
    });
    if (!created.ok) throw new Error(created.refusal.code);
    const result = finishDiscovery(created.stepper);
    expect(produced).toBe(cap); expect(result.termination).toBe("queue-cap");
    expect(result.counters.peakQueuedStates).toBe(cap); expect(result.counters.workUnits).toBe(0);
    expect(result.counters.queuedStates).toBe(0);
    created.stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
  }
});
