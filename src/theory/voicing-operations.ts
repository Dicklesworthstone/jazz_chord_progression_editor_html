import type { VoicingCandidateOperations } from "./voicing-candidates-contract";
import { realizeVoicing } from "./voicing-candidates";

/** Stable public operation table for dependency injection at application seams. */
export const voicingCandidateOperations = Object.freeze({
  realizeVoicing,
} satisfies VoicingCandidateOperations);
