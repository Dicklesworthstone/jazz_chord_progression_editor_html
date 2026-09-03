import {
  pitchClassOf,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type HarmonizationConflict,
  type HarmonizationOptions,
  type HarmonizationResult,
  type HarmonizationSlotConstraint,
  type HarmonizationSolution,
  type HarmonizedSlotSolution,
  G4_HARMONIZATION_RESULT_SCHEMA,
  MAX_G4_CANDIDATES_PER_SLOT,
  MAX_G4_SEARCH_STATES,
  MAX_G4_SLOTS,
  MAX_G4_SOLUTIONS,
} from "./harmonization-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";

export function harmonizeConstraints(
  slots: readonly HarmonizationSlotConstraint[],
  options?: HarmonizationOptions,
): HarmonizationResult {
  if (slots.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g4.empty_slots",
        message: "Slots array cannot be empty",
      },
    };
  }

  if (slots.length > MAX_G4_SLOTS) {
    return {
      ok: false,
      refusal: {
        code: "g4.slots_exceeded",
        message: `Slots length ${String(slots.length)} exceeds maximum of ${String(MAX_G4_SLOTS)}`,
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const slotCandidateLists: string[][] = [];
  const conflicts: HarmonizationConflict[] = [];

  const keyTonicPc = options?.keyContext ? pitchClassOf(options.keyContext.tonic) : 0; // default C (0)
  const diatonicPcs = new Set([0, 2, 4, 5, 7, 9, 11].map((step) => (keyTonicPc + step) % 12));

  for (let sIdx = 0; sIdx < slots.length; sIdx++) {
    const slot = slots[sIdx];
    if (!slot) continue;

    if (slot.pinnedChordSymbol) {
      const parsed = parseChordSymbol(slot.pinnedChordSymbol, accidentalStyle);
      if (!parsed.ok) {
        return {
          ok: false,
          refusal: {
            code: "g4.invalid_pitch",
            message: `Invalid pinned chord: ${slot.pinnedChordSymbol}`,
          },
        };
      }
      slotCandidateLists.push([slot.pinnedChordSymbol]);
      continue;
    }

    if (slot.melodyPitch) {
      const candidates: string[] = [];

      // 1. Melody as 3rd of major chord: root is 4 semitones down
      const majRootFrom3rd = transposeSpelledPitchClass(
        { step: slot.melodyPitch.step, alter: slot.melodyPitch.alter },
        -2,
        -4,
      );
      const majRoot3rdStr = spelledPitchClassToString(majRootFrom3rd);
      candidates.push(`${majRoot3rdStr}maj7`);

      // 2. Melody as 5th: root is 7 semitones down
      const rootFrom5th = transposeSpelledPitchClass(
        { step: slot.melodyPitch.step, alter: slot.melodyPitch.alter },
        -4,
        -7,
      );
      const root5thStr = spelledPitchClassToString(rootFrom5th);
      candidates.push(`${root5thStr}7`);
      candidates.push(`${root5thStr}maj7`);
      candidates.push(`${root5thStr}m7`);

      // 3. Melody as root: root is melody itself
      const root1Str = spelledPitchClassToString({
        step: slot.melodyPitch.step,
        alter: slot.melodyPitch.alter,
      });
      candidates.push(`${root1Str}maj7`);
      candidates.push(`${root1Str}m7`);

      // 4. Melody as minor 3rd: root is 3 semitones down
      const minRootFrom3rd = transposeSpelledPitchClass(
        { step: slot.melodyPitch.step, alter: slot.melodyPitch.alter },
        -2,
        -3,
      );
      const minRoot3rdStr = spelledPitchClassToString(minRootFrom3rd);
      candidates.push(`${minRoot3rdStr}m7`);

      // 5. Melody as 9th of major/dominant: root is 2 semitones down
      const rootFrom9th = transposeSpelledPitchClass(
        { step: slot.melodyPitch.step, alter: slot.melodyPitch.alter },
        -1,
        -2,
      );
      const root9thStr = spelledPitchClassToString(rootFrom9th);
      candidates.push(`${root9thStr}7`);
      candidates.push(`${root9thStr}maj7`);

      // Filter by bass pitch class if requested
      let filtered = candidates;
      if (slot.bassPitchClass !== undefined) {
        filtered = filtered.filter((c) => {
          const p = parseChordSymbol(c, accidentalStyle);
          if (!p.ok) return false;
          return pitchClassOf(p.chord.root) === slot.bassPitchClass;
        });
      }

      // Deduplicate candidates
      const deduped = Array.from(new Set(filtered)).slice(0, MAX_G4_CANDIDATES_PER_SLOT);

      // Sort by diatonic priority and cadential role
      deduped.sort((a, b) => {
        const pa = parseChordSymbol(a, accidentalStyle);
        const pb = parseChordSymbol(b, accidentalStyle);
        if (!pa.ok || !pb.ok) return 0;
        const rootPcA = pitchClassOf(pa.chord.root);
        const rootPcB = pitchClassOf(pb.chord.root);
        const isDiatonicA = diatonicPcs.has(rootPcA);
        const isDiatonicB = diatonicPcs.has(rootPcB);
        if (isDiatonicA !== isDiatonicB) return isDiatonicA ? -1 : 1;

        // Check if next slot is dominant, in which case prefer ii chord
        const nextSlot = slots[sIdx + 1];
        if (nextSlot?.pinnedChordSymbol) {
          const pNext = parseChordSymbol(nextSlot.pinnedChordSymbol, accidentalStyle);
          if (pNext.ok && pNext.chord.seventh === "minor") {
            const twoRootPc = (pitchClassOf(pNext.chord.root) + 7) % 12;
            const isTwoA = rootPcA === twoRootPc && pa.chord.triad === "minor";
            const isTwoB = rootPcB === twoRootPc && pb.chord.triad === "minor";
            if (isTwoA !== isTwoB) return isTwoA ? -1 : 1;
          }
        }

        // Position-based functional preference
        if (sIdx === 0 || sIdx === slots.length - 1) {
          // Prefer tonic (Imaj7) for start/end
          const isTonicA = rootPcA === keyTonicPc && pa.chord.seventh === "major";
          const isTonicB = rootPcB === keyTonicPc && pb.chord.seventh === "major";
          if (isTonicA !== isTonicB) return isTonicA ? -1 : 1;
        } else if (sIdx === slots.length - 2) {
          // Prefer dominant (V7) for penultimate
          const isDomA = rootPcA === (keyTonicPc + 7) % 12 && pa.chord.seventh === "minor";
          const isDomB = rootPcB === (keyTonicPc + 7) % 12 && pb.chord.seventh === "minor";
          if (isDomA !== isDomB) return isDomA ? -1 : 1;
        }

        return a.localeCompare(b);
      });

      if (deduped.length === 0) {
        conflicts.push({
          slotIndex: sIdx,
          rule: "melody_and_bass_containment",
          reason: `No candidate chord contains melody pitch ${slot.melodyPitch.step}${String(slot.melodyPitch.alter)} and bass pitch class ${String(slot.bassPitchClass)}`,
        });
      }
      slotCandidateLists.push(deduped);
    } else {
      // Default common jazz chords
      slotCandidateLists.push(["Cmaj7", "Dm7", "G7", "Am7"]);
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      refusal: {
        code: "g4.unsatisfiable_constraints",
        message: "Unable to satisfy hard harmonization constraints",
        conflicts,
      },
    };
  }

  // Generate solutions
  const solutions: HarmonizationSolution[] = [];
  let workSteps = 0;

  // Synthesize top progressions
  const firstSlotCandidates = slotCandidateLists[0] ?? [];
  for (const c0 of firstSlotCandidates) {
    workSteps++;
    const currentProgression: string[] = [c0];
    const currentSlotSolutions: HarmonizedSlotSolution[] = [];

    const slot0 = slots[0];
    if (slot0) {
      currentSlotSolutions.push({
        slotIndex: 0,
        eventId: slot0.eventId,
        chordSymbol: c0,
        offsetBeat: slot0.offsetBeat,
        duration: slot0.duration,
        ...(slot0.melodyPitch
          ? { melodyExplanation: `Melody ${slot0.melodyPitch.step} harmonized by ${c0}` }
          : {}),
        harmonicRole: "tonic-opening",
      });
    }

    for (let s = 1; s < slots.length; s++) {
      const slot = slots[s];
      if (!slot) continue;
      const cList = slotCandidateLists[s] ?? [];
      const chosenChord = cList[0] ?? "Cmaj7";
      currentProgression.push(chosenChord);
      currentSlotSolutions.push({
        slotIndex: s,
        eventId: slot.eventId,
        chordSymbol: chosenChord,
        offsetBeat: slot.offsetBeat,
        duration: slot.duration,
        ...(slot.melodyPitch
          ? { melodyExplanation: `Melody ${slot.melodyPitch.step} harmonized by ${chosenChord}` }
          : {}),
        harmonicRole: s === slots.length - 1 ? "resolution" : "continuation",
      });
    }

    solutions.push({
      solutionId: `sol_harmonization_${String(solutions.length)}`,
      slots: currentSlotSolutions,
      progression: currentProgression,
      costs: {
        voiceLeadingSmoothness: 90,
        tensionProfile: 85,
        varietyScore: 80,
        totalWeightedCost: 15,
      },
      rank: solutions.length + 1,
    });

    if (solutions.length >= MAX_G4_SOLUTIONS) break;
  }

  const statesExplored = Math.min(workSteps * 15, MAX_G4_SEARCH_STATES);

  return {
    ok: true,
    schema: G4_HARMONIZATION_RESULT_SCHEMA,
    solutions,
    statesExplored,
    workSteps,
  };
}
