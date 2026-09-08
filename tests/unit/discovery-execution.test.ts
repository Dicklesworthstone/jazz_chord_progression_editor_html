import { expect, test } from "bun:test";
import { createDiscoveryArena } from "../../src/theory/discovery-arena";
import { captureDiscoveryValue } from "../../src/theory/discovery-data";
import { createDiscoveryStepper, inspectMeasuredDiscoveryResult, type DiscoveryEnumerationKernel, type DiscoveryExpansionSink } from "../../src/theory/discovery-execution";
import type { DiscoveryBudgets, DiscoveryCursor } from "../../src/theory/discovery-execution-contract";
import { discoveryDraft, discoveryFixtureKernel, discoveryRequest, finishDiscovery } from "../support/discovery-execution-fixture";
import laws from "../fixtures/discovery-execution/law-cases.json";

function job(budgets: Partial<DiscoveryBudgets> = {}, kernel = discoveryFixtureKernel()) {
  const request = discoveryRequest(budgets);
  const arena = createDiscoveryArena(request.budgets.trackedBytes);
  if (arena === null) throw new Error("Fixture arena refused");
  const created = createDiscoveryStepper(request, arena, kernel);
  if (!created.ok) throw new Error(created.refusal.code);
  return { arena, stepper: created.stepper, request };
}

for (const fixture of laws.enumerations) test(`independent ${fixture.id} visits actual FIFO states and emits literal outcomes`, () => {
  const visited: string[] = [];
  const { stepper, arena } = job({}, discoveryFixtureKernel(fixture, visited));
  const result = finishDiscovery(stepper);
  const { expected } = fixture;
  expect(visited).toEqual(expected.visited);
  expect(result.options.map(row => row.value)).toEqual(expected.options);
  expect(result.options.map(row => row.id)).toEqual(expected.optionIds);
  for (const key of ["expandedStates", "workUnits", "workQuanta", "generatedCandidates", "retainedOptions", "peakQueuedStates", "depthReached"] as const) {
    expect(result.counters[key]).toBe(expected[key]);
  }
  expect(expected.kind).toBe(result.kind); expect(expected.termination).toBe(result.termination);
  expect(result.counters).toMatchObject(arena.inspect());
  expect(inspectMeasuredDiscoveryResult(result)?.counters).toBe(result.counters);
  expect(inspectMeasuredDiscoveryResult({ ...result })).toBe(null);
  stepper.dispose();
  expect(arena.inspect().retainedBytes).toBe(0);
  expect(arena.inspect().allocations).toBe(arena.inspect().releases);
  expect(inspectMeasuredDiscoveryResult(result)).toBe(null);
});

test("all32 six-unit partitions and oversized legal quanta produce byte-identical results, including actual allocation counts", () => {
  const schedules: number[][] = [...laws.quantumSchedules];
  for (let mask = 0; mask < 32; mask += 1) {
    const parts: number[] = []; let part = 1;
    for (let boundary = 0; boundary < 5; boundary += 1) {
      if ((mask & (1 << boundary)) !== 0) { parts.push(part); part = 1; } else part += 1;
    }
    parts.push(part); schedules.push(parts);
  }
  let bytes: string | null = null;
  for (const schedule of schedules) {
    const { stepper } = job();
    const result = JSON.stringify(finishDiscovery(stepper, schedule));
    if (bytes === null) bytes = result; else expect(result).toBe(bytes);
    stepper.dispose();
  }
});

for (const fixture of laws.prefixes) test(`${fixture.id}: completion is checked before spending the next unit`, () => {
  const visited: string[] = [];
  const { stepper } = job({ workUnits: fixture.workCap }, discoveryFixtureKernel(laws.enumerations[0], visited));
  const result = finishDiscovery(stepper, [1]);
  expect(visited).toEqual(fixture.visited);
  expect(result.options.map(row => row.value)).toEqual(fixture.options);
  expect(fixture.kind).toBe(result.kind); expect(fixture.termination).toBe(result.termination);
  stepper.dispose();
});

test("zero semantic budgets allow a genuinely empty enumeration", () => {
  const { stepper } = job({ workUnits: 0, expandedStates: 0, queuedStates: 0, generatedCandidates: 0,
    retainedOptions: 0, outgoingPerState: 0, depth: 0 }, discoveryFixtureKernel(laws.enumerations[1]));
  expect(finishDiscovery(stepper).kind).toBe("no-result"); stepper.dispose();
});

test("every quantum/cursor refusal is terminal, idempotent and releases queued/output ownership on disposal", () => {
  for (const quantum of [0, -1, 0.5, 1025, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { stepper, arena } = job();
    const advance = stepper.step(quantum, null);
    expect(advance.kind).toBe("finished");
    if (advance.kind !== "finished") throw new Error("Invalid quantum yielded");
    expect(advance.result.kind).toBe("refused");
    expect(advance.result.counters.workUnits).toBe(0);
    expect(stepper.cancel("cancelled")).toBe(advance.result);
    stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
  }
  for (const kind of ["copied", "previous", "foreign"]) {
    const { stepper, arena } = job(), other = job();
    const first = stepper.step(1, null), foreign = other.stepper.step(1, null);
    if (first.kind !== "yielded" || foreign.kind !== "yielded") throw new Error("Fixture exhausted early");
    let cursor: DiscoveryCursor = { ...first.cursor };
    if (kind === "foreign") cursor = foreign.cursor;
    if (kind === "previous") { stepper.step(1, first.cursor); cursor = first.cursor; }
    const result = stepper.step(1, cursor);
    if (result.kind !== "finished") throw new Error("Forged cursor accepted");
    expect(result.result.kind).toBe("refused"); expect(result.result.options).toEqual([]);
    stepper.dispose(); other.stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
  }
});

test("cancel and stale before/after every yield discard options and cannot run another expansion", () => {
  for (const reason of ["cancelled", "stale"] as const) for (let cut = 0; cut < 6; cut += 1) {
    const visited: string[] = [];
    const { stepper, arena } = job({}, discoveryFixtureKernel(laws.enumerations[0], visited));
    let cursor: DiscoveryCursor | null = null;
    for (let unit = 0; unit < cut; unit += 1) {
      const next = stepper.step(1, cursor);
      if (next.kind !== "yielded") throw new Error("Fixture finished before cancellation cut");
      cursor = next.cursor;
    }
    const result = stepper.cancel(reason);
    expect(result.kind).toBe(reason); expect(result.options).toEqual([]);
    expect(visited.length).toBe(cut); expect(result.counters.queuedStates).toBe(0);
    expect(stepper.step(1024, cursor)).toEqual({ kind: "finished", result });
    expect(visited.length).toBe(cut);
    stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
  }
});

test("actual push/offer sites enforce caps before calling exhausted producers", () => {
  let produced = 0;
  const kernel: DiscoveryEnumerationKernel = { family: "protocol", maximumWorkspaceBytes: 4096,
    seed: (_request, sink) => { sink.enqueue(() => "s"); },
    expand: (_state, _request, sink) => { sink.offer(() => { produced += 1; return discoveryDraft(1); }); },
  };
  const capped = job({ generatedCandidates: 0 }, kernel);
  expect(finishDiscovery(capped.stepper).termination).toBe("candidate-cap");
  expect(produced).toBe(0); capped.stepper.dispose();
  for (const [budgets, termination] of [
    [{ expandedStates: 0 }, "state-cap"], [{ queuedStates: 0 }, "queue-cap"],
    [{ outgoingPerState: 0 }, "outgoing-cap"], [{ depth: 0 }, "depth-cap"],
    [{ retainedOptions: 0 }, "option-cap"],
  ] satisfies readonly (readonly [Partial<DiscoveryBudgets>, string])[]) {
    const { stepper } = job(budgets);
    const result = finishDiscovery(stepper);
    expect(result.kind).toBe("bounded-partial"); expect(termination).toBe(result.termination);
    stepper.dispose();
  }
});

test("a retained sink cannot mutate the queue, counters or memory after its synchronous expansion", () => {
  const sinks: DiscoveryExpansionSink[] = [];
  const { arena, stepper } = job({}, { family: "protocol", maximumWorkspaceBytes: 4096,
    seed: (_request, sink) => { sinks.push(sink); sink.enqueue(() => "s"); },
    expand: (_state, _request, sink) => { sinks.push(sink); sink.offer(() => discoveryDraft(1)); },
  });
  let producerCalls = 0;
  const before = arena.inspect();
  expect(sinks[0]?.enqueue(() => { producerCalls += 1; return "late"; })).toBe(false);
  expect(arena.inspect()).toEqual(before);
  const terminal = finishDiscovery(stepper);
  for (const sink of sinks) {
    expect(sink.offer(() => { producerCalls += 1; return discoveryDraft(2); })).toBe(false);
  }
  expect(producerCalls).toBe(0); expect(terminal.options.map(row => row.value)).toEqual([1]);
  stepper.dispose();
  expect(sinks[0]?.enqueue(() => "after-dispose")).toBe(false);
  expect(arena.inspect().retainedBytes).toBe(0);
});

test("state size is the accepted graph charge, including escaped control text without a hidden wire cap", () => {
  const { stepper } = job({}, { family: "protocol", maximumWorkspaceBytes: 262144,
    seed: (_request, sink) => { sink.enqueue(() => "\u0001".repeat(20000)); },
    expand: (state, _request, sink) => { if (typeof state === "string") sink.offer(() => discoveryDraft(state.length)); },
  });
  const result = finishDiscovery(stepper);
  expect(result.kind).toBe("complete"); expect(result.options.map(row => row.value)).toEqual([20000]);
  stepper.dispose();
});

test("registered profiles preserve their upstream option/state/outgoing/depth ceilings", () => {
  for (const [family, budgets] of [
    ["G0", { retainedOptions: 6 }], ["G2", { retainedOptions: 17 }],
    ["G3", { retainedOptions: 8, expandedStates: 50001, outgoingPerState: 64 }],
    ["G3", { retainedOptions: 8, expandedStates: 50000, outgoingPerState: 65 }],
    ["G5", { depth: 4, outgoingPerState: 8 }], ["G5", { depth: 3, outgoingPerState: 9 }],
  ] satisfies readonly (readonly [DiscoveryEnumerationKernel["family"], Partial<DiscoveryBudgets>])[]) {
    const request = discoveryRequest(budgets), arena = createDiscoveryArena(67108864);
    if (arena === null) throw new Error("Fixture arena refused");
    expect(createDiscoveryStepper(request, arena, { ...discoveryFixtureKernel(), family }).ok).toBe(false);
    expect(arena.inspect().retainedBytes).toBe(0);
  }
  for (const [family, budgets] of [
    ["G0", { retainedOptions: 5 }], ["G2", { retainedOptions: 16 }],
    ["G3", { retainedOptions: 8, expandedStates: 50000, outgoingPerState: 64 }],
    ["G5", { depth: 3, outgoingPerState: 8 }],
  ] satisfies readonly (readonly [DiscoveryEnumerationKernel["family"], Partial<DiscoveryBudgets>])[]) {
    const { stepper } = job(budgets, { ...discoveryFixtureKernel(), family });
    expect(finishDiscovery(stepper).kind).toBe("complete"); stepper.dispose();
  }
});

test("original request mutation cannot alter the captured job's constraints, seed or input", () => {
  const input = { written: ["Cb4", "B3", "Cb4"] }, request = { ...discoveryRequest(), input };
  const arena = createDiscoveryArena(67108864);
  if (arena === null) throw new Error("Fixture arena refused");
  const created = createDiscoveryStepper(request, arena, discoveryFixtureKernel());
  if (!created.ok) throw new Error(created.refusal.code);
  input.written.reverse(); input.written[1] = "D4";
  Object.defineProperty(request, "constraints", { value: { foreign: true } });
  Object.defineProperty(request.identity, "seed", { value: 42 });
  const result = finishDiscovery(created.stepper);
  expect(result.request.input).toEqual({ written: ["Cb4", "B3", "Cb4"] });
  expect(result.request.constraints).toBe(null); expect(result.identity.seed).toBe(null);
  expect(Object.isFrozen(result.request)).toBe(true);
  expect(Object.isFrozen(result.options[0]?.costs)).toBe(true);
  created.stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
});

test("large escaped options terminate at the actual UTF-8 result ceiling with complete counters and released ownership", () => {
  const { stepper, arena } = job({}, { family: "protocol", maximumWorkspaceBytes: 4194304,
    seed: (_request, sink) => { sink.enqueue(() => 0); },
    expand: (_state, _request, sink) => {
      for (let i = 0; i < 12; i += 1) {
        if (!sink.offer(() => ({ ...discoveryDraft(i), value: ["\u0001".repeat(65000), "\u0002".repeat(65000)] }))) break;
      }
    },
  });
  const result = finishDiscovery(stepper);
  expect(result.kind).toBe("bounded-partial"); expect(result.termination).toBe("result-byte-cap");
  expect(result.options.map(row => row.order[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(result.counters.generatedCandidates).toBe(11); expect(result.counters.retainedOptions).toBe(10);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(8388608);
  expect(arena.inspect().peakTrackedBytes).toBeLessThanOrEqual(67108864);
  stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
});

test("state graph storage accepts maximum-1/maximum and refuses maximum+1 without truncation", () => {
  for (const length of [32763, 32764, 32765]) {
    const { stepper, arena } = job({}, { family: "protocol", maximumWorkspaceBytes: 524288,
      seed: (_request, sink) => { sink.enqueue(() => "s".repeat(length)); },
      expand: (value, _request, sink) => { if (typeof value === "string") sink.offer(() => discoveryDraft(value.length)); },
    });
    const result = finishDiscovery(stepper);
    if (length <= 32764) {
      expect(result.kind).toBe("complete"); expect(result.options.map(row => row.value)).toEqual([length]);
    } else {
      expect(result.kind).toBe("bounded-partial"); expect(result.termination).toBe("memory-cap");
      expect(result.counters.workUnits).toBe(0); expect(result.options).toEqual([]);
    }
    stepper.dispose(); expect(arena.inspect().retainedBytes).toBe(0);
  }
});

test("actual reservation sites spend exact payload plus owned bookkeeping before allocating", () => {
  const arena = createDiscoveryArena(300);
  if (arena === null) throw new Error("Valid fixture ledger refused");
  const first = arena.reserve(8);
  expect(first?.bytes).toBe(136);
  expect(arena.inspect()).toEqual({ retainedBytes: 136, peakTrackedBytes: 136, allocations: 1, releases: 0 });
  const second = arena.reserve(36);
  expect(second?.bytes).toBe(164);
  expect(arena.inspect()).toEqual({ retainedBytes: 300, peakTrackedBytes: 300, allocations: 2, releases: 0 });
  expect(arena.reserve(0)).toBe(null);
  expect(arena.inspect()).toEqual({ retainedBytes: 300, peakTrackedBytes: 300, allocations: 2, releases: 0 });
  if (first === null || second === null) throw new Error("Exact-bound fixture reservation refused");
  expect(arena.release(first)).toBe(true);
  expect(arena.inspect()).toEqual({ retainedBytes: 164, peakTrackedBytes: 300, allocations: 2, releases: 1 });
  expect(arena.release(second)).toBe(true);
  expect(arena.inspect()).toEqual({ retainedBytes: 0, peakTrackedBytes: 300, allocations: 2, releases: 2 });
});

test("foreign, copied and double-released handles cannot free another owner's data", () => {
  const left = createDiscoveryArena(1024), right = createDiscoveryArena(1024);
  if (left === null || right === null) throw new Error("Valid fixture ledger refused");
  const owned = left.reserve(8), foreign = right.reserve(8);
  if (owned === null || foreign === null) throw new Error("Valid fixture reservation refused");
  const before = left.inspect();
  expect(left.release(foreign)).toBe(false);
  expect(left.release({ ...owned })).toBe(false);
  expect(left.inspect()).toEqual(before);
  expect(left.release(owned)).toBe(true);
  const after = left.inspect();
  expect(left.release(owned)).toBe(false);
  expect(left.inspect()).toEqual(after);
  expect(right.inspect()).toEqual(before);
});

test("zero-sized payloads still spend registry storage; invalid sizes never change counters", () => {
  const arena = createDiscoveryArena(128);
  if (arena === null) throw new Error("Valid fixture ledger refused");
  for (const bytes of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
    expect(arena.reserve(bytes)).toBe(null);
    expect(arena.inspect()).toEqual({ retainedBytes: 0, peakTrackedBytes: 0, allocations: 0, releases: 0 });
  }
  expect(arena.reserve(0)?.bytes).toBe(128);
  expect(arena.reserve(0)).toBe(null);
  expect(arena.inspect()).toEqual({ retainedBytes: 128, peakTrackedBytes: 128, allocations: 1, releases: 0 });
  expect(createDiscoveryArena(0)?.reserve(0)).toBe(null);
  for (const maximum of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 67_108_865]) expect(createDiscoveryArena(maximum)).toBe(null);
});

test("passive input becomes a frozen canonical snapshot without mutating its owner", () => {
  const arena = createDiscoveryArena(4096);
  if (arena === null) throw new Error("Valid fixture ledger refused");
  const input = { z: [1, 2], a: "Cb4" };
  const captured = captureDiscoveryValue(input, arena);
  if (!captured.ok) throw new Error(captured.refusal.code);
  expect(captured.value.canonical).toBe('{"a":"Cb4","z":[1,2]}');
  expect(captured.value.bytes).toBe(21);
  expect(Object.isFrozen(captured.value.value)).toBe(true);
  expect(Object.isFrozen(input)).toBe(false);
  input.z.reverse(); input.a = "B3";
  expect(captured.value.value).toEqual({ a: "Cb4", z: [1, 2] });
  expect(arena.release(captured.value.reservation)).toBe(true);
  expect(arena.inspect().retainedBytes).toBe(0);
});

test("canonical byte limits use UTF-8, escaping and exact max/max+1 admission", () => {
  const arena = createDiscoveryArena(4096);
  if (arena === null) throw new Error("Valid fixture ledger refused");
  // Quotes2 + Db ASCII2 + flat UTF-8 three + emoji four + escaped newline two.
  const input = "Db♭🎹\n";
  const at = captureDiscoveryValue(input, arena, 13);
  expect(at.ok).toBe(true);
  if (at.ok) { expect(at.value.bytes).toBe(13); expect(arena.release(at.value.reservation)).toBe(true); }
  const before = arena.inspect();
  expect(captureDiscoveryValue(input, arena, 12).ok).toBe(false);
  expect(arena.inspect()).toEqual(before);
  const control = captureDiscoveryValue("\u0001", arena, 8);
  expect(control.ok).toBe(true);
  if (control.ok) expect(control.value.canonical).toBe('"\\u0001"');
});

test("capture reserves graph, canonical data and workspace before making retained copies", () => {
  // Literal {x:[1,2]} graph98; canonical11 units: string30, workspace120,
  // capture/owner/wrapper bookkeeping1024 and reservation bookkeeping128 =1400.
  const at = createDiscoveryArena(1400), below = createDiscoveryArena(1399);
  if (at === null || below === null) throw new Error("Valid fixture ledger refused");
  const input = { x: [1, 2] };
  const accepted = captureDiscoveryValue(input, at);
  expect(accepted.ok).toBe(true);
  if (accepted.ok) { expect(accepted.value.graphCharge).toBe(98); expect(accepted.value.reservation.bytes).toBe(1400); }
  expect(captureDiscoveryValue(input, below).ok).toBe(false);
  expect(below.inspect()).toEqual({ retainedBytes: 0, peakTrackedBytes: 0, allocations: 0, releases: 0 });
});

test("hostile shapes refuse without invoking getters or acquiring arena ownership", () => {
  const arena = createDiscoveryArena(4096);
  if (arena === null) throw new Error("Valid fixture ledger refused");
  let getterCalls = 0;
  const accessor = Object.defineProperty({}, "x", { enumerable: true, get() { getterCalls += 1; return 1; } });
  const cycle: { self?: unknown } = {}; cycle.self = cycle;
  const hidden = Object.defineProperty({}, "x", { value: 1 });
  const symbol = { [Symbol("x")]: 1 };
  const hole = new Array<unknown>(1);
  for (const input of [accessor, hidden, cycle, symbol, hole, new Date(0), undefined,
    Number.NaN, Number.POSITIVE_INFINITY, "\ud800", "\udc00", { x: undefined }, () => 1]) {
    const result = captureDiscoveryValue(input, arena);
    expect(result.ok).toBe(false);
    expect(arena.inspect()).toEqual({ retainedBytes: 0, peakTrackedBytes: 0, allocations: 0, releases: 0 });
  }
  expect(getterCalls).toBe(0);
});

test("dangerous-looking own keys remain passive data and cannot change a prototype", () => {
  const arena = createDiscoveryArena(4096);
  if (arena === null) throw new Error("Valid fixture ledger refused");
  const input: unknown = JSON.parse('{"__proto__":{"polluted":true},"constructor":1}');
  const captured = captureDiscoveryValue(input, arena);
  expect(captured.ok).toBe(true);
  if (captured.ok) expect(captured.value.canonical).toBe('{"__proto__":{"polluted":true},"constructor":1}');
  expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
});
