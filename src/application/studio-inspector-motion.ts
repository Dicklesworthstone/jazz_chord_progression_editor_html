import type { ChordEvent, ValidatedDocument } from "../domain";
import { assignVoiceTransition, initializeVoiceFrame,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA, VOICE_ASSIGNMENT_POLICY_ID, VOICE_ASSIGNMENT_POLICY_VERSION,
  type UnassignedVoiceFrame } from "../theory";
import { buildStudioRealizations } from "./studio-realization";
import { candidateVoiceFrame, storedVoiceFrame } from "./studio-voicing-frames";
import type { InspectorMotionView } from "./u2-chord-inspector-contract";

/** V1 analyzes the selected sounding registers. No ordinal pairing or octave folding. */
export function projectInspectorMotion(document: ValidatedDocument, eventId: string, draftDirty: boolean): InspectorMotionView {
  const ordered = document.sections.flatMap(section => section.measures.flatMap(measure =>
    measure.events.map(event => ({ event, sectionId: section.id, boundary: section.voiceLeadingBoundary }))));
  const index = ordered.findIndex(item => item.event.id === eventId);
  const current = ordered[index], next = index < 0 ? undefined : ordered[index + 1];
  const previous = index > 0 ? ordered[index - 1] : undefined;
  const empty = (unavailableReason: string | null): InspectorMotionView => Object.freeze({
    previousChordSymbol: previous?.event.chord.sourceText ?? null, nextChordSymbol: next?.event.chord.sourceText ?? null,
    commonToneCount: 0, stepwiseMotionCount: 0, voicePaths: [], unavailableReason, assignmentEvidence: null,
  });
  if (current === undefined || next === undefined) return empty("There is no following chord to compare.");
  if (draftDirty) return empty("Apply the symbol draft before comparing its sounding registers.");
  if (next.sectionId !== current.sectionId && next.boundary === "reset") return empty("Voice leading resets at the next section.");
  const realized = buildStudioRealizations(document);
  if (!realized.ok) return empty(realized.refusal.message);
  const frame = (event: ChordEvent): UnassignedVoiceFrame | null => {
    if (event.voicing.mode !== "auto") return storedVoiceFrame(event.id, event.voicing);
    const binding = realized.realizations.get(event.id);
    if (binding?.kind !== "generated" || !binding.outcome.ok) return null;
    const realization = binding.request.resolved.realizations.find(value => value.id === binding.request.realizationId);
    return realization === undefined ? null : candidateVoiceFrame(event.id, binding.outcome.candidate, realization);
  };
  const from = frame(current.event), to = frame(next.event);
  if (from === null || to === null) return empty("This comparison requires playable voicings with three to seven distinct pitches. Exact stored notes remain unchanged.");
  const requestId = "studio-inspector-motion";
  const initialized = initializeVoiceFrame({ schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA, kind: "initialize", requestId, frame: from });
  if (!initialized.ok) return empty(initialized.refusal.code);
  const assigned = assignVoiceTransition({ schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA, kind: "transition", requestId,
    from: initialized.value.frame, to, locks: [], policyId: VOICE_ASSIGNMENT_POLICY_ID, policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION });
  if (!assigned.ok) return Object.freeze({ ...empty(assigned.refusal.code), assignmentEvidence: assigned.evidence });
  return Object.freeze({ ...empty(null), assignmentEvidence: assigned.evidence,
    commonToneCount: assigned.value.arcs.filter(arc => arc.kind === "match" && arc.absoluteSemitones === 0).length,
    stepwiseMotionCount: assigned.value.arcs.filter(arc => arc.kind === "match" && arc.absoluteSemitones > 0 && arc.absoluteSemitones <= 2).length,
    voicePaths: Object.freeze(assigned.value.arcs.map(arc => Object.freeze({
      fromPitch: arc.from?.pitch ?? null, toPitch: arc.to?.pitch ?? null, intervalSemis: arc.absoluteSemitones,
      motionType: arc.kind !== "match" ? arc.kind : arc.absoluteSemitones === 0 ? "common" as const
        : arc.absoluteSemitones <= 2 ? "step" as const : arc.absoluteSemitones <= 4 ? "skip" as const : "leap" as const,
    }))),
  });
}
