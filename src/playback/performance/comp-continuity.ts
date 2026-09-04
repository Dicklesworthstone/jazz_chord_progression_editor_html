import type { PlaybackEvent } from "../playback-plan-contract";
import {
  PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES,
  type CompContinuityEvidence, type PerformanceCompRegister, type PerformanceRole,
} from "./performance-plan-contract";

type Cost = readonly [alignment: number, gaps: number, bottomMotion: number];
type State = Readonly<{ shift: number; dropCount: number; notes: readonly number[]; cost: Cost; predecessor: number }>;

function compare(a: Cost, b: Cost): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** At most 16 voices per side. Two rows; no wall-clock or recursion. */
function alignment(from: readonly number[], to: readonly number[]): Readonly<{ cost: Cost; cells: number }> {
  let row: Cost[] = Array.from({ length: to.length + 1 }, (_, j) => [12 * j, j, 0]);
  let cells = row.length;
  for (let i = 0; i < from.length; i += 1) {
    const next: Cost[] = [[12 * (i + 1), i + 1, 0]];
    cells += 1;
    for (let j = 0; j < to.length; j += 1) {
      const diagonal = row[j];
      const above = row[j + 1];
      const left = next[j];
      const a = from[i];
      const b = to[j];
      if (diagonal === undefined || above === undefined || left === undefined || a === undefined || b === undefined) {
        throw new Error("performance.continuity_alignment_shape");
      }
      const options: Cost[] = [[diagonal[0] + Math.abs(a - b), diagonal[1], 0],
        [above[0] + 12, above[1] + 1, 0], [left[0] + 12, left[1] + 1, 0]];
      let best = options[0];
      if (best === undefined) throw new Error("performance.continuity_alignment_empty");
      for (const option of options) if (compare(option, best) < 0) best = option;
      next.push(best);
      cells += 1;
    }
    row = next;
  }
  const cost = row[to.length];
  if (cost === undefined) throw new Error("performance.continuity_alignment_result");
  return { cost, cells };
}

/**
 * Exact shortest path through at most two admissible octave placements per
 * comp. Call only after the performance compiler's event/voice-count gates.
 * Bass is fixed. A top slice is reduced further only if the full sounding
 * gate's bass-separation floor leaves neither octave admissible.
 */
export function leadCompRegisters(
  events: readonly PlaybackEvent[], roles: readonly PerformanceRole[], register: PerformanceCompRegister,
): Readonly<{ placements: ReadonlyMap<number, Readonly<{ shift: number; dropCount: number }>>; evidence: CompContinuityEvidence }> {
  const layers: Readonly<{ eventIndex: number; states: readonly State[] }>[] = [];
  const bassEvents = events.filter((_, i) => roles[i] === "bass");
  let bassCursor = 0;
  let bass: number | null = null;
  let bassOverlapChecks = 0;
  let placementChecks = 0;
  let candidateTransitions = 0;
  let alignmentCells = 0;
  let tracebackStates = 0;
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    if (event === undefined) continue;
    if (roles[eventIndex] === "bass") { bass = event.midiPitches[0]; continue; }
    let floor = Math.max(register.lowMidi, bass === null ? register.lowMidi : bass + PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES);
    while (bassCursor < bassEvents.length) {
      const held = bassEvents[bassCursor];
      if (held === undefined || held.startTick + held.gateDurationTicks > event.startTick) break;
      bassCursor += 1;
    }
    for (let i = bassCursor; i < bassEvents.length; i += 1) {
      const held = bassEvents[i];
      if (held === undefined || held.startTick >= event.startTick + event.gateDurationTicks) break;
      bassOverlapChecks += 1;
      floor = Math.max(floor, held.midiPitches[0] + PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES);
    }
    const highest = event.midiPitches[event.midiPitches.length - 1];
    if (highest === undefined) throw new Error("performance.continuity_empty_comp");
    // Same top-slice fallback as register policy 1, but the floor covers every
    // bass sounding during this comp, including an attack later in its gate.
    let dropCount = 0;
    let shifts: number[] = [];
    for (; dropCount < event.midiPitches.length; dropCount += 1) {
      const bottom = event.midiPitches[dropCount];
      if (bottom === undefined) break;
      const home = Math.floor((register.lowMidi - bottom + 11) / 12);
      shifts = [home, home + 1].filter((shift) => {
        placementChecks += 1;
        return bottom + 12 * shift >= floor && bottom + 12 * shift <= register.highMidi && highest + 12 * shift <= register.ceilingMidi;
      });
      if (shifts.length > 0) break;
    }
    const lowest = event.midiPitches[dropCount];
    if (lowest === undefined) throw new Error("performance.continuity_register_unreachable");
    const states: State[] = [];
    const previous = layers[layers.length - 1]?.states;
    for (const shift of shifts) {
      const notes = event.midiPitches.slice(dropCount).map((midi) => midi + 12 * shift);
      let best: State | undefined;
      if (previous === undefined) best = { shift, dropCount, notes, cost: [0, 0, 0], predecessor: -1 };
      else previous.forEach((prefix, predecessor) => {
        const edge = alignment(prefix.notes, notes);
        const bottom = prefix.notes[0];
        if (bottom === undefined) throw new Error("performance.continuity_empty_prefix");
        candidateTransitions += 1;
        alignmentCells += edge.cells;
        const cost: Cost = [prefix.cost[0] + edge.cost[0], prefix.cost[1] + edge.cost[1],
          prefix.cost[2] + Math.abs(lowest + 12 * shift - bottom)];
        if (best === undefined || compare(cost, best.cost) < 0) best = { shift, dropCount, notes, cost, predecessor };
      });
      if (best !== undefined) states.push(best);
    }
    if (states.length === 0) throw new Error("performance.continuity_register_unreachable");
    tracebackStates += states.length;
    layers.push({ eventIndex, states });
  }
  const last = layers[layers.length - 1];
  let winner = 0;
  let cost: Cost = [0, 0, 0];
  last?.states.forEach((state, index) => {
    if (index === 0 || compare(state.cost, cost) < 0) { winner = index; cost = state.cost; }
  });
  const placements = new Map<number, Readonly<{ shift: number; dropCount: number }>>();
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    const state = layer?.states[winner];
    if (layer === undefined || state === undefined) throw new Error("performance.continuity_traceback");
    placements.set(layer.eventIndex, { shift: state.shift, dropCount: state.dropCount });
    winner = state.predecessor;
  }
  return { placements, evidence: Object.freeze({ policyVersion: 2, compEvents: layers.length,
    candidateTransitions, alignmentCells, tracebackStates, bassOverlapChecks, placementChecks,
    alignmentCost: cost[0], gapCount: cost[1], bottomMotion: cost[2] }) };
}
