import {
  type BeatValue,
  type ChordEventId,
  type KeyContext,
  type SpelledPitch,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const G4_HARMONIZATION_RESULT_SCHEMA = "changes.harmonization-result.v1" as const;

export const MAX_G4_SLOTS = 16 as const;
export const MAX_G4_CANDIDATES_PER_SLOT = 128 as const;
export const MAX_G4_SEARCH_STATES = 100000 as const;
export const MAX_G4_SOLUTIONS = 8 as const;

export interface HarmonizationSlotConstraint {
  readonly slotIndex: number;
  readonly eventId: ChordEventId;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
  readonly melodyPitch?: SpelledPitch;
  readonly bassPitchClass?: number; // 0..11
  readonly pinnedChordSymbol?: string;
}

export interface HarmonizationSoftCosts {
  readonly voiceLeadingSmoothness: number; // 0..100
  readonly tensionProfile: number; // 0..100
  readonly varietyScore: number; // 0..100
  readonly totalWeightedCost: number;
}

export interface HarmonizedSlotSolution {
  readonly slotIndex: number;
  readonly eventId: ChordEventId;
  readonly chordSymbol: string;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
  readonly melodyExplanation?: string;
  readonly harmonicRole: string;
}

export interface HarmonizationSolution {
  readonly solutionId: string;
  readonly slots: readonly HarmonizedSlotSolution[];
  readonly progression: readonly string[];
  readonly costs: HarmonizationSoftCosts;
  readonly rank: number;
}

export interface HarmonizationConflict {
  readonly slotIndex: number;
  readonly rule: string;
  readonly reason: string;
}

export interface G4Refusal {
  readonly code:
    | "g4.empty_slots"
    | "g4.slots_exceeded"
    | "g4.candidates_exceeded"
    | "g4.invalid_pitch"
    | "g4.unsatisfiable_constraints"
    | "g4.stale_revision";
  readonly message: string;
  readonly conflicts?: readonly HarmonizationConflict[];
}

export type HarmonizationResult =
  | {
      readonly ok: true;
      readonly schema: typeof G4_HARMONIZATION_RESULT_SCHEMA;
      readonly solutions: readonly HarmonizationSolution[];
      readonly statesExplored: number;
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G4Refusal;
    };

export interface HarmonizationOptions {
  readonly keyContext?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
  readonly maxSolutions?: number;
  readonly allowReharmonization?: boolean;
}
