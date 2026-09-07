import type { ChordEvent, ValidatedDocument } from "../domain";
import { assignVoiceTransition, initializeVoiceFrame,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA, VOICE_ASSIGNMENT_POLICY_ID, VOICE_ASSIGNMENT_POLICY_VERSION,
  type UnassignedVoiceFrame } from "../theory";
import { buildStudioRealizations } from "./studio-realization";
import { candidateVoiceFrame, storedVoiceFrame } from "./studio-voicing-frames";
import type { InspectorMotionSegment, InspectorMotionView } from "./u2-chord-inspector-contract";

/** V1 analyzes both neighboring transitions at actual sounding registers. */
export function projectInspectorMotion(document: ValidatedDocument, eventId: string, draftDirty: boolean): InspectorMotionView {
  const ordered = document.sections.flatMap(section => section.measures.flatMap(measure =>
    measure.events.map(event => ({ event, sectionId: section.id, boundary: section.voiceLeadingBoundary }))));
  const index = ordered.findIndex(item => item.event.id === eventId);
  const current = ordered[index], next = index < 0 ? undefined : ordered[index + 1];
  const previous = index > 0 ? ordered[index - 1] : undefined;
  const empty = (unavailableReason: string | null): InspectorMotionSegment => Object.freeze({
    commonToneCount: 0, stepwiseMotionCount: 0, voicePaths: [], unavailableReason, assignmentEvidence: null,
  });
  // One shared bounded realization for both comparisons; a dirty unresolved AST
  // cannot borrow notes from the stored chord. Provisional valid drafts supply
  // their own validated document through the application draft service.
  const realized = draftDirty || current === undefined ? null : buildStudioRealizations(document);
  const frame = (event: ChordEvent): UnassignedVoiceFrame | null => {
    if (event.voicing.mode !== "auto") return storedVoiceFrame(event.id, event.voicing);
    const binding = realized?.ok ? realized.realizations.get(event.id) : undefined;
    if (binding?.kind !== "generated" || !binding.outcome.ok) return null;
    const realization = binding.request.resolved.realizations.find(value => value.id === binding.request.realizationId);
    return realization === undefined ? null : candidateVoiceFrame(event.id, binding.outcome.candidate, realization);
  };
  const compare = (fromEvent: typeof current, toEvent: typeof current, direction: "incoming" | "outgoing"): InspectorMotionSegment => {
    if (fromEvent === undefined || toEvent === undefined) return empty(direction === "incoming" ? "There is no previous chord to compare." : "There is no following chord to compare.");
    if (draftDirty) return empty("Resolve the symbol draft before comparing its sounding registers.");
    if (toEvent.sectionId !== fromEvent.sectionId && toEvent.boundary === "reset") return empty("Voice leading resets at this section boundary.");
    if (realized === null || !realized.ok) return empty(realized === null ? "No selected chord." : realized.refusal.message);
    const from = frame(fromEvent.event), to = frame(toEvent.event);
    if (from === null || to === null) return empty("This comparison requires playable voicings with three to seven distinct pitches. Exact stored notes remain unchanged.");
    const requestId = `studio-inspector-motion-${direction}`;
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
  };
  return Object.freeze({ ...compare(current, next, "outgoing"), incoming: compare(previous, current, "incoming"),
    previousChordSymbol: previous?.event.chord.sourceText ?? null, nextChordSymbol: next?.event.chord.sourceText ?? null });
}
