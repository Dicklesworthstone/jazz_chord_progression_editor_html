import {
  type ChordEventId,
} from "../domain";
import {
  type G9SessionResult,
  type PracticeAnswerSubmission,
  type PracticeGradeReport,
  type PracticeSession,
  type PracticeSessionOptions,
} from "./g9-contract";
import {
  createPracticeSession,
  gradePracticeSubmission,
} from "./practice-laboratory";

export interface G9Operations {
  readonly createPracticeSession: (
    events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
    }[],
    options?: PracticeSessionOptions,
  ) => G9SessionResult;
  readonly gradePracticeSubmission: (
    session: PracticeSession,
    submissions: readonly PracticeAnswerSubmission[],
  ) => PracticeGradeReport;
}

export const g9Operations: G9Operations = Object.freeze({
  createPracticeSession,
  gradePracticeSubmission,
});
