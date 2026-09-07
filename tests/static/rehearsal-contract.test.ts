import { expect, test } from "bun:test";
import { REHEARSAL_LIMITS, REHEARSAL_FAILURE_CODES, REHEARSAL_SPECIFICATION_STATUS } from "../../src/playback/rehearsal/session-contract";
import packet from "../fixtures/rehearsal/cases.json";
import sourceDocument from "../fixtures/exact-share/document.changes.json";

// This is an independent arithmetic check of literal pre-implementation
// examples. No production compiler, transport or audio adapter is exercised.
type Ratio = readonly [bigint, bigint];
function ratio(values: readonly number[]): Ratio {
  const [numerator, denominator] = values;
  if (numerator === undefined || denominator === undefined || denominator <= 0) throw new Error("Invalid independent fraction");
  return [BigInt(numerator), BigInt(denominator)];
}
function plus(a: Ratio, b: Ratio): Ratio { return [a[0] * b[1] + b[0] * a[1], a[1] * b[1]]; }
function compare(a: Ratio, b: Ratio): number {
  const difference = a[0] * b[1] - b[0] * a[1];
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
function reduced(value: Ratio): readonly number[] {
  let a = value[0] < 0n ? -value[0] : value[0], b = value[1];
  while (b !== 0n) [a, b] = [b, a % b];
  return [Number(value[0] / a), Number(value[1] / a)];
}
function seconds(ticks: number, tempo: number): Ratio { return [BigInt(ticks) * 60n, 960n * BigInt(tempo)]; }

test("packet remains specification-only and independently pins every resource edge", () => {
  expect(REHEARSAL_SPECIFICATION_STATUS).toBe("specified-not-implemented");
  expect(packet.productionOutputUsed).toBe(false);
  expect(packet.expectedValuesGenerated).toBe(false);
  const limits = new Map<string, number>(Object.entries(REHEARSAL_LIMITS));
  for (const row of packet.bounds) {
    expect(limits.get(row.resource)).toBe(row.maximum);
    expect(row.nextAttempt).toBe(row.maximum + 1);
    expect(Number.isSafeInteger(row.nextAttempt)).toBe(true);
  }
  expect(12 * 65_536).toBe(REHEARSAL_LIMITS.inputEventsVisited);
  expect(64 * 65_536).toBe(REHEARSAL_LIMITS.passEventVisits);
  expect(64 * 960_000_000).toBe(REHEARSAL_LIMITS.expandedTicks);
  expect(REHEARSAL_LIMITS.countInBars).toBe(1);
  expect([REHEARSAL_LIMITS.tempoMinimum, REHEARSAL_LIMITS.tempoMaximum]).toEqual([20, 400]);
});

for (const row of [...packet.projection.events, ...packet.projection.extraEdges]) {
  test(`literal half-open projection: ${row.id}`, () => {
    const left = 960, right = 2880;
    const sourceEnd = row.start + row.duration;
    if (row.start >= right || sourceEnd <= left) {
      expect(row.expected).toBe(null);
      return;
    }
    const start = Math.max(left, row.start), end = Math.min(right, sourceEnd);
    const restarted = start > row.start, clipped = end < sourceEnd;
    const articulation = restarted
      ? clipped ? "loop-restart-end-clipped" : "loop-restart"
      : clipped ? "loop-end-clipped" : "ordinary";
    expect(row.expected).toEqual({ start, duration: end - start,
      gate: Math.max(1, end - start - 24),
      offset: restarted ? (row.offset ?? 0) + start - row.start : row.offset,
      articulation });
  });
}

test("three grooved passes have independently exact attack/release times and one count-in", () => {
  expect(packet.threePass.occurrences).toHaveLength(12);
  expect(packet.projection.events.filter(row => row.expected !== null).map(row => row.id)).toEqual(packet.projection.retainedIds);
  const firstTempo = packet.threePass.tempos[0];
  if (firstTempo === undefined) throw new Error("Missing initial tempo");
  const countIn = seconds(4 * 960, firstTempo);
  expect([0, 1, 2, 3].map(beat => reduced(seconds(beat * 960, firstTempo)))).toEqual(packet.threePass.countInClicksSeconds);
  let start = countIn;
  for (const [pass, tempo] of packet.threePass.tempos.entries()) {
    const expectedStart = packet.threePass.passStartsSeconds[pass];
    if (expectedStart === undefined) throw new Error("Missing independent pass start");
    expect(reduced(start)).toEqual(expectedStart);
    const occurrences = packet.threePass.occurrences.filter(row => row.pass === pass);
    expect(occurrences.map(row => row.event)).toEqual(packet.projection.retainedIds);
    for (const occurrence of occurrences) {
      const event = packet.projection.events.find(row => row.id === occurrence.event)?.expected;
      if (event == null) throw new Error("Missing independent projected event");
      const attack = plus(start, seconds(event.start - 960, tempo));
      expect(reduced(attack)).toEqual(occurrence.attack);
      expect(reduced(plus(attack, seconds(event.gate, tempo)))).toEqual(occurrence.release);
    }
    start = plus(start, seconds(packet.threePass.rangeTicks, tempo));
  }
  expect(reduced(start)).toEqual(packet.threePass.completionSeconds);
  const edge = packet.threePass.earlyRetirementNearMiss;
  expect(compare(ratio(edge.lookaheadAt), ratio(edge.outgoingGateRelease))).toBe(-1);
  expect(compare(ratio(edge.outgoingGateRelease), ratio(edge.nextPassStarts))).toBe(-1);
  expect(edge.retireAtLookahead).toBe(false);
});

test("audible state uses half-open pass epochs, including count-in and natural completion", () => {
  for (const row of packet.threePass.audible) {
    const now = ratio(row.now);
    let pass = 0;
    for (const [index, start] of packet.threePass.passStartsSeconds.entries()) {
      if (compare(now, ratio(start)) >= 0) pass = index;
    }
    expect(pass).toBe(row.pass);
    expect(packet.threePass.tempos[pass]).toBe(row.tempo);
    expect(compare(now, ratio([2, 1])) < 0).toBe(row.countingIn);
    expect(compare(now, ratio(packet.threePass.completionSeconds)) >= 0 ? "complete" : "playing").toBe(row.state);
  }
});

for (const row of packet.tempos) {
  test(`tempo integer oracle: ${String(row.start)} to ${String(row.end)} over ${String(row.passes)}`, () => {
    // Brute-force distance minimization, independent of the specified closed
    // interpolation formula. Ties prefer the candidate toward the endpoint.
    const values: number[] = [];
    for (let index = 0; index < row.passes; index += 1) {
      const denominator = Math.max(1, row.passes - 1);
      const numerator = row.start * denominator + (row.end - row.start) * index;
      let chosen = 20, distance = Number.POSITIVE_INFINITY;
      for (let candidate = 20; candidate <= 400; candidate += 1) {
        const error = Math.abs(candidate * denominator - numerator);
        if (error < distance || (error === distance && row.end >= row.start)) {
          chosen = candidate;
          distance = error;
        }
      }
      values.push(chosen);
    }
    expect(values).toEqual(row.expected);
  });
}

for (const row of packet.requestEdges) {
  test(`scalar refusal precedence before work: ${row.id}`, () => {
    const total = row.templates * row.passesPerKey;
    const validTempo = (tempo: number) => Number.isInteger(tempo) && tempo >= 20 && tempo <= 400;
    const refusal = row.templates < 1 || row.templates > 12 ? "rehearsal.key_invalid"
      : !Number.isInteger(row.passesPerKey) || row.passesPerKey < 1 || total > 64 ? "rehearsal.pass_limit"
        : !validTempo(row.start) || !validTempo(row.end) || (total === 1 && row.start !== row.end) ? "rehearsal.tempo_invalid" : null;
    expect(refusal).toBe(row.refusal);
    expect(refusal === null ? total : null).toBe(row.expectedTotal);
    if (refusal !== null) expect(REHEARSAL_FAILURE_CODES).toContain(refusal);
  });
}

test("pickup, empty and partial bars retain full-chart groove phase and exact widths", () => {
  let tick = 0;
  for (const [index, bar] of packet.timeline.measures.entries()) {
    expect(tick).toBe(bar.expectedStart);
    tick += bar.completion === "empty" ? 3 * 960 : bar.eventTicks.reduce((a, b) => a + b, 0);
    expect(tick).toBe(bar.expectedEnd);
    expect(index % 2).toBe(bar.barPhase);
  }
  expect(tick).toBe(8640);
  expect(packet.timeline.emptySectionTicks).toBe(0);
  const silentMeasure = packet.timeline.measures.find(bar => bar.id === "empty");
  expect(silentMeasure?.eventTicks).toEqual(packet.timeline.silentRangeExpectedEvents);
  expect([silentMeasure?.expectedStart, silentMeasure?.expectedEnd]).toEqual(packet.timeline.silentRange);
  for (const row of packet.timeline.rangeEdges) {
    const left = ratio(row.start), right = ratio(row.end);
    const ticksIntegral = (value: Ratio) => value[0] * 960n % value[1] === 0n;
    const invalid = !ticksIntegral(left) || !ticksIntegral(right) || compare(left, [0n, 1n]) < 0
      || compare(left, right) > 0 || compare(right, [9n, 1n]) > 0;
    expect(invalid ? "rehearsal.range_invalid" : compare(left, right) === 0 ? "rehearsal.range_empty" : null).toBe(row.refusal);
  }
});

test("a single horizon can contain all64 short passes while only pass3 is audible", () => {
  const row = packet.shortPasses;
  const duration = seconds(row.rangeTicks, row.tempo);
  expect(reduced(duration)).toEqual(row.passDurationSeconds);
  const end: Ratio = [duration[0] * BigInt(row.passes), duration[1]];
  expect(reduced(end)).toEqual(row.completionSeconds);
  expect(compare(end, ratio(row.horizonSeconds))).toBe(-1);
  const now = ratio(row.nowSeconds);
  expect(Number(now[0] * duration[1] / (now[1] * duration[0]))).toBe(row.audiblePass);
  expect(row.scheduledLastPass).toBe(row.passes - 1);
  expect(row.eventOccurrences).toBe(64);
  expect(row.uniqueOccurrenceIds).toBe(64);
  expect(row.audiblePass).not.toBe(row.scheduledLastPass);
});

const letters = ["C", "D", "E", "F", "G", "A", "B"];
const natural = [0, 2, 4, 5, 7, 9, 11];
type Pitch = Readonly<{ step: string; alter: number; octave: number }>;
function midi(pitch: Pitch): number {
  const value = natural[letters.indexOf(pitch.step)];
  if (value === undefined) throw new Error("Invalid independent pitch");
  return 12 * (pitch.octave + 1) + value + pitch.alter;
}
function transpose(pitch: Pitch, diatonic: number, chromatic: number): Pitch {
  const index = pitch.octave * 7 + letters.indexOf(pitch.step) + diatonic;
  const stepIndex = ((index % 7) + 7) % 7;
  const step = letters[stepIndex], base = natural[stepIndex];
  if (step === undefined || base === undefined) throw new Error("Invalid independent interval");
  const octave = Math.floor(index / 7);
  return { step, alter: midi(pitch) + chromatic - (12 * (octave + 1) + base), octave };
}
function spelling(pitch: Pitch): string {
  return `${pitch.step}${pitch.alter < 0 ? "b".repeat(-pitch.alter) : "#".repeat(pitch.alter)}${String(pitch.octave)}`;
}

test("explicit12-key order preserves intervals, inverse spellings, pitch order and duplicate unisons", () => {
  expect(packet.keyOrder.fromC.map(row => row.tonic)).toEqual(packet.keyOrder.tonics);
  expect(packet.keyOrder.fromC.map(row => row.chromatic)).toEqual(packet.keyOrder.pitchClasses);
  expect(new Set(packet.keyOrder.pitchClasses).size).toBe(12);
  expect(packet.keyOrder.expectedTemplates).toEqual(packet.keyOrder.orderedTemplates.flatMap((_, index) => [index, index]));
  expect(packet.projection.orderedPitchWitness.map(midi)).toEqual(packet.projection.orderedMidiWitness);
  const sourceEvents = sourceDocument.sections.flatMap(section => section.measures.flatMap(measure => measure.events));
  expect(sourceEvents.map(event => event.voicing.mode)).toEqual(["manual", "frozen"]);
  for (const row of packet.keyOrder.fromC) {
    const transformed = packet.keyOrder.sourceWitness.map(pitch => transpose(pitch, row.diatonic, row.chromatic));
    expect(transformed.map(spelling)).toEqual(row.pitches);
    expect(transformed.map(midi)).toEqual(row.midi);
    expect(transformed.map(pitch => transpose(pitch, -row.diatonic, -row.chromatic))).toEqual(packet.keyOrder.sourceWitness);
    for (const event of sourceEvents) {
      const output = event.voicing.pitches.map(pitch => transpose(pitch, row.diatonic, row.chromatic));
      expect(output.map(pitch => transpose(pitch, -row.diatonic, -row.chromatic))).toEqual(event.voicing.pitches);
      expect(output.map(midi)).toEqual(event.voicing.pitches.map(pitch => midi(pitch) + row.chromatic));
    }
  }
  for (const row of packet.keyOrder.rangeRefusals) expect(row.midi + row.delta >= 0 && row.midi + row.delta <= 127).toBe(row.accepted);
});

test("named future source mutations target concrete independent differences; these are not runtime mutation kills", () => {
  expect(new Set(packet.mutationControls.map(row => row.id)).size).toBe(18);
  for (const row of packet.mutationControls) expect(Object.hasOwn(packet, row.witness)).toBe(true);
  expect(packet.lifetime).toHaveLength(14);
  for (const row of packet.lifetime) {
    expect(row.expected.length).toBeGreaterThan(20);
    expect(row.counterexample).not.toBe(row.expected);
  }
  expect(packet.projection.events.find(row => row.id === "left.b0")?.expected?.offset).not.toBe(480);
  expect(packet.threePass.passStartsSeconds[1]).not.toEqual([5, 1]);
  expect(packet.tempos[0]?.expected).not.toEqual([80, 86, 93, 100]);
  expect(packet.tempos[3]?.expected).not.toEqual([121, 121, 120]);
  expect(packet.keyOrder.sourceWitness.map(midi)).toHaveLength(3);
});
