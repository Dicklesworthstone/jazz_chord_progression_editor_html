import {
  type ChordEventId,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const G9_PRACTICE_SESSION_SCHEMA = "changes.practice-session.v1" as const;
export const G9_PRACTICE_RUBRIC_SCHEMA = "changes.practice-rubric.v1" as const;

export const MAX_G9_PROMPTS_PER_SESSION = 32 as const;
export const MAX_G9_OPTIONS_PER_PROMPT = 8 as const;

export type PracticeExerciseKind =
  | "spelling"
  | "chord-roles"
  | "guide-tones"
  | "cadence-recognition"
  | "constrained-completion"
  | "reharmonization-comparison";

export interface PracticePromptOption {
  readonly optionId: string;
  readonly text: string;
  readonly isCorrect: boolean;
  readonly feedback?: string;
}

export interface PracticePrompt {
  readonly promptId: string;
  readonly kind: PracticeExerciseKind;
  readonly targetEventId?: ChordEventId;
  readonly question: string;
  readonly contextChords: readonly string[];
  readonly options: readonly PracticePromptOption[];
  readonly acceptedExactAnswers: readonly string[];
  readonly explanation: string;
  readonly pointsPossible: number;
}

export interface PracticeSession {
  readonly schema: typeof G9_PRACTICE_SESSION_SCHEMA;
  readonly sessionId: string;
  readonly seed: number;
  readonly title: string;
  readonly exerciseKinds: readonly PracticeExerciseKind[];
  readonly prompts: readonly PracticePrompt[];
  readonly totalPointsPossible: number;
}

export interface PracticeAnswerSubmission {
  readonly promptId: string;
  readonly selectedOptionId?: string;
  readonly textAnswer?: string;
}

export interface PracticeGradedItem {
  readonly promptId: string;
  readonly isCorrect: boolean;
  readonly pointsAwarded: number;
  readonly feedback: string;
}

export interface PracticeGradeReport {
  readonly schema: typeof G9_PRACTICE_RUBRIC_SCHEMA;
  readonly sessionId: string;
  readonly items: readonly PracticeGradedItem[];
  readonly totalPointsAwarded: number;
  readonly totalPointsPossible: number;
  readonly scorePercentage: number; // 0..100
}

export interface G9Refusal {
  readonly code:
    | "g9.empty_events"
    | "g9.prompts_exceeded"
    | "g9.invalid_seed"
    | "g9.invalid_chord"
    | "g9.unsupported_exercise"
    | "g9.stale_revision";
  readonly message: string;
}

export type G9SessionResult =
  | {
      readonly ok: true;
      readonly session: PracticeSession;
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G9Refusal;
    };

export interface PracticeSessionOptions {
  readonly seed?: number;
  readonly exerciseKinds?: readonly PracticeExerciseKind[];
  readonly maxPrompts?: number;
  readonly keyContext?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
}
