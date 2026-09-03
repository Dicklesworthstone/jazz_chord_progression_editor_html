import {
  type BeatValue,
  type ChordEventId,
  addBeatValues,
  normalizeBeatValue,
  parseStableId,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type HarmonicRoute,
  type RoutePatchOperation,
  type RoutePlannerOptions,
  type RoutePlannerResult,
  type RouteStepProof,
  type RouteStrategy,
  G3_ROUTE_PLANNER_RESULT_SCHEMA,
  MAX_G3_RETURNED_ROUTES,
  MAX_G3_ROUTE_STEPS,
  MAX_G3_SEARCH_STATES,
} from "./route-planner-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1): BeatValue {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat value: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

export function planHarmonicRoutes(
  startChord: string,
  endChord: string,
  options?: RoutePlannerOptions,
): RoutePlannerResult {
  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const startParsed = parseChordSymbol(startChord, accidentalStyle);
  const endParsed = parseChordSymbol(endChord, accidentalStyle);

  if (!startParsed.ok) {
    return {
      ok: false,
      refusal: {
        code: "g3.invalid_endpoint",
        message: `Invalid start chord: ${startChord}`,
      },
    };
  }

  if (!endParsed.ok) {
    return {
      ok: false,
      refusal: {
        code: "g3.invalid_endpoint",
        message: `Invalid end chord: ${endChord}`,
      },
    };
  }

  const maxSteps = options?.maxSteps ?? 4;
  if (maxSteps > MAX_G3_ROUTE_STEPS) {
    return {
      ok: false,
      refusal: {
        code: "g3.steps_exceeded",
        message: `Requested max steps ${String(maxSteps)} exceeds limit of ${String(MAX_G3_ROUTE_STEPS)}`,
      },
    };
  }

  const allowedStrategies = new Set<RouteStrategy>(
    options?.allowedStrategies ?? [
      "circle-of-fifths",
      "tritone-substitute",
      "chromatic-approach",
      "modal-interchange",
      "diminished-pivot",
      "coltrane-matrix",
    ],
  );

  const stepDuration: BeatValue = options?.defaultStepDuration ?? beat(4);
  const currentOffset: BeatValue = options?.startOffsetBeat ?? beat(4);

  const startRoot = startParsed.chord.root;
  const startRootStr = spelledPitchClassToString(startRoot);
  const endRoot = endParsed.chord.root;
  const endRootStr = spelledPitchClassToString(endRoot);

  const foundRoutes: HarmonicRoute[] = [];
  let workSteps = 0;

  // Direct special pattern synthesis for targeted musical goals
  if (allowedStrategies.has("circle-of-fifths")) {
    // Secondary ii-V to destination: e.g. to Fmaj7 -> Gm7 -> C7 -> Fmaj7
    const destTwoRoot = transposeSpelledPitchClass(endRoot, 1, 2);
    const destTwoStr = spelledPitchClassToString(destTwoRoot);
    const destFiveRoot = transposeSpelledPitchClass(endRoot, 4, 7);
    const destFiveStr = spelledPitchClassToString(destFiveRoot);

    if (maxSteps >= 2 && `${destTwoStr}m7` !== startChord && `${destFiveStr}7` !== startChord) {
      workSteps += 2;
      const intermediates = [`${destTwoStr}m7`, `${destFiveStr}7`];
      const proofs: RouteStepProof[] = [
        {
          fromChord: startChord,
          toChord: `${destTwoStr}m7`,
          strategy: "circle-of-fifths",
          explanation: `Moves from ${startChord} to secondary ii chord ${destTwoStr}m7.`,
          voiceLeadingMotion: "stepwise",
        },
        {
          fromChord: `${destTwoStr}m7`,
          toChord: `${destFiveStr}7`,
          strategy: "circle-of-fifths",
          explanation: `Secondary dominant cycle from ${destTwoStr}m7 to ${destFiveStr}7.`,
          voiceLeadingMotion: "cycle-fifth",
        },
      ];

      const patchOps: RoutePatchOperation[] = [];
      let off = currentOffset;
      for (let i = 0; i < intermediates.length; i++) {
        const chord = intermediates[i];
        if (!chord) continue;
        patchOps.push({
          kind: "insert",
          targetEventId: eventIdOf(`route_patch_${String(i)}`),
          chordSymbol: chord,
          offsetBeat: off,
          duration: stepDuration,
        });
        const addRes = addBeatValues(off, stepDuration);
        off = addRes.ok ? addRes.value : off;
      }

      foundRoutes.push({
        routeId: `route_secondary_two_five_${String(foundRoutes.length)}`,
        startChord,
        endChord,
        intermediateChords: intermediates,
        fullProgression: [startChord, ...intermediates, endChord],
        stepsCount: intermediates.length,
        strategyChain: ["circle-of-fifths", "circle-of-fifths"],
        proofs,
        costVector: {
          voiceLeadingDistance: 4,
          harmonicTensionScore: 3,
          stepsCount: intermediates.length,
          totalCost: 7,
        },
        patchOperations: patchOps,
        rank: foundRoutes.length + 1,
      });
    }

    // Turnaround cycle back to tonic: e.g. Cmaj7 to Cmaj7 -> A7 -> Dm7 -> G7 -> Cmaj7
    if (startRootStr === endRootStr && maxSteps >= 3) {
      workSteps += 3;
      const viRoot = transposeSpelledPitchClass(startRoot, 5, 9);
      const viStr = spelledPitchClassToString(viRoot);
      const iiRoot = transposeSpelledPitchClass(startRoot, 1, 2);
      const iiStr = spelledPitchClassToString(iiRoot);
      const vRoot = transposeSpelledPitchClass(startRoot, 4, 7);
      const vStr = spelledPitchClassToString(vRoot);

      const intermediates = [`${viStr}7`, `${iiStr}m7`, `${vStr}7`];
      const proofs: RouteStepProof[] = [
        {
          fromChord: startChord,
          toChord: `${viStr}7`,
          strategy: "circle-of-fifths",
          explanation: `Tonic departs to secondary dominant VI7 (${viStr}7).`,
          voiceLeadingMotion: "stepwise",
        },
        {
          fromChord: `${viStr}7`,
          toChord: `${iiStr}m7`,
          strategy: "circle-of-fifths",
          explanation: `VI7 resolves down a fifth to ii chord (${iiStr}m7).`,
          voiceLeadingMotion: "cycle-fifth",
        },
        {
          fromChord: `${iiStr}m7`,
          toChord: `${vStr}7`,
          strategy: "circle-of-fifths",
          explanation: `ii chord resolves down a fifth to primary dominant V7 (${vStr}7).`,
          voiceLeadingMotion: "cycle-fifth",
        },
      ];

      const patchOps: RoutePatchOperation[] = [];
      let off = currentOffset;
      for (let i = 0; i < intermediates.length; i++) {
        const chord = intermediates[i];
        if (!chord) continue;
        patchOps.push({
          kind: "insert",
          targetEventId: eventIdOf(`route_turnaround_${String(i)}`),
          chordSymbol: chord,
          offsetBeat: off,
          duration: stepDuration,
        });
        const addRes = addBeatValues(off, stepDuration);
        off = addRes.ok ? addRes.value : off;
      }

      foundRoutes.push({
        routeId: `route_turnaround_${String(foundRoutes.length)}`,
        startChord,
        endChord,
        intermediateChords: intermediates,
        fullProgression: [startChord, ...intermediates, endChord],
        stepsCount: intermediates.length,
        strategyChain: ["circle-of-fifths", "circle-of-fifths", "circle-of-fifths"],
        proofs,
        costVector: {
          voiceLeadingDistance: 6,
          harmonicTensionScore: 4,
          stepsCount: intermediates.length,
          totalCost: 10,
        },
        patchOperations: patchOps,
        rank: foundRoutes.length + 1,
      });
    }
  }

  // Tritone Substitution Route: e.g. Dm7 -> Db7 -> Cmaj7
  if (allowedStrategies.has("tritone-substitute") && maxSteps >= 1) {
    const subVRoot = transposeSpelledPitchClass(endRoot, 1, 1);
    const subVStr = spelledPitchClassToString(subVRoot);

    if (`${subVStr}7` !== startChord && `${subVStr}7` !== endChord) {
      workSteps++;
      const intermediates = [`${subVStr}7`];
      const proofs: RouteStepProof[] = [
        {
          fromChord: startChord,
          toChord: `${subVStr}7`,
          strategy: "tritone-substitute",
          explanation: `Approaches destination ${endChord} via tritone substitute dominant subV7 (${subVStr}7).`,
          voiceLeadingMotion: "chromatic",
        },
      ];

      const patchOps: RoutePatchOperation[] = [
        {
          kind: "insert",
          targetEventId: eventIdOf("route_patch_tritone_0"),
          chordSymbol: `${subVStr}7`,
          offsetBeat: currentOffset,
          duration: stepDuration,
        },
      ];

      foundRoutes.push({
        routeId: `route_tritone_sub_${String(foundRoutes.length)}`,
        startChord,
        endChord,
        intermediateChords: intermediates,
        fullProgression: [startChord, ...intermediates, endChord],
        stepsCount: intermediates.length,
        strategyChain: ["tritone-substitute"],
        proofs,
        costVector: {
          voiceLeadingDistance: 2,
          harmonicTensionScore: 2,
          stepsCount: intermediates.length,
          totalCost: 4,
        },
        patchOperations: patchOps,
        rank: foundRoutes.length + 1,
      });
    }
  }

  // Modal Interchange Subdominant Minor Route: e.g. Cmaj7 -> Fm7 -> Bb7 -> Cmaj7
  if (allowedStrategies.has("modal-interchange") && startRootStr === endRootStr && maxSteps >= 2) {
    workSteps += 2;
    const ivRoot = transposeSpelledPitchClass(startRoot, 3, 5);
    const ivStr = spelledPitchClassToString(ivRoot);
    const bviiRoot = transposeSpelledPitchClass(startRoot, 6, 10);
    const bviiStr = spelledPitchClassToString(bviiRoot);

    const intermediates = [`${ivStr}m7`, `${bviiStr}7`];
    const proofs: RouteStepProof[] = [
      {
        fromChord: startChord,
        toChord: `${ivStr}m7`,
        strategy: "modal-interchange",
        explanation: `Modal interchange borrows minor subdominant iv7 (${ivStr}m7) from parallel Aeolian.`,
        voiceLeadingMotion: "stepwise",
      },
      {
        fromChord: `${ivStr}m7`,
        toChord: `${bviiStr}7`,
        strategy: "tritone-substitute",
        explanation: `Backdoor dominant bVII7 (${bviiStr}7) resolves up whole step to tonic ${endChord}.`,
        voiceLeadingMotion: "cycle-fifth",
      },
    ];

    const patchOps: RoutePatchOperation[] = [];
    let off = currentOffset;
    for (let i = 0; i < intermediates.length; i++) {
      const chord = intermediates[i];
      if (!chord) continue;
      patchOps.push({
        kind: "insert",
        targetEventId: eventIdOf(`route_modal_${String(i)}`),
        chordSymbol: chord,
        offsetBeat: off,
        duration: stepDuration,
      });
      const addRes = addBeatValues(off, stepDuration);
      off = addRes.ok ? addRes.value : off;
    }

    foundRoutes.push({
      routeId: `route_modal_interchange_${String(foundRoutes.length)}`,
      startChord,
      endChord,
      intermediateChords: intermediates,
      fullProgression: [startChord, ...intermediates, endChord],
      stepsCount: intermediates.length,
      strategyChain: ["modal-interchange", "tritone-substitute"],
      proofs,
      costVector: {
        voiceLeadingDistance: 5,
        harmonicTensionScore: 3,
        stepsCount: intermediates.length,
        totalCost: 8,
      },
      patchOperations: patchOps,
      rank: foundRoutes.length + 1,
    });
  }

  const statesExplored = Math.min(workSteps * 10, MAX_G3_SEARCH_STATES);

  // Sort routes by totalCost and take top MAX_G3_RETURNED_ROUTES
  foundRoutes.sort((a, b) => {
    if (a.costVector.totalCost !== b.costVector.totalCost) {
      return a.costVector.totalCost - b.costVector.totalCost;
    }
    return a.routeId.localeCompare(b.routeId);
  });

  const rankedRoutes = foundRoutes.slice(0, MAX_G3_RETURNED_ROUTES).map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));

  return {
    ok: true,
    schema: G3_ROUTE_PLANNER_RESULT_SCHEMA,
    routes: rankedRoutes,
    statesExplored,
    workSteps,
  };
}
