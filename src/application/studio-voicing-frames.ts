/**
 * The V0-to-V1 frame bridge: one retained voicing candidate, or one stored
 * Manual/Frozen voicing, expressed as the V1 `UnassignedVoiceFrame` the V2
 * progression optimizer consumes.
 *
 * The role facts follow the V1 role policy
 * (`changes.voice-assignment.v0-template-roles`) exactly as V1's own
 * validation defines them:
 *
 * - `guideDegrees` are the selected T1 realization's `guideToneDegrees`, and
 *   a voice is a guide tone exactly when its degree is a member. This is the
 *   same source V0's adaptive templates declare
 *   (`guideToneSource: "selected-realization-guide-tone"`).
 * - `colorDegrees` come from the candidate's template row: only
 *   fixed-degree-sequence rows (shell, rootless) own static slots with role
 *   `"color"` (`VOICING_TEMPLATE_DEGREE_ROLES`); adaptive rows (balanced,
 *   open, drop2) and quartal rows own no static color slots, so their color
 *   set is empty. A voice is a color tone exactly when its degree is a
 *   member, which keeps V1's `color-flag-mismatch` law satisfied by
 *   construction.
 *
 * Voices are copied from the V0 candidate verbatim — ordinal, pitch, midi,
 * provenance, degree, sourceDegreeIndex — adding only the two role booleans.
 * Stored voicings carry no degrees at all, so their frames use the
 * slash-bass provenance (the one V0 voice shape whose degree is honestly
 * null) and empty role sets, and are gated through the real V1 frame
 * validator before they may join a progression chain.
 */
import {
  projectSpelledPitch,
  type ChordDegree,
  type ChordEventId,
  type FrozenVoicing,
  type ManualVoicing,
  type MidiPitch,
  type SpelledPitch,
} from "../domain";
import {
  SEMANTIC_REALIZATION_IDS,
  VOICE_ASSIGNMENT_FRAME_SCHEMA,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA,
  VOICE_ASSIGNMENT_ROLE_POLICY_ID,
  VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
  VOICING_CANDIDATE_IDS,
  VOICING_TEMPLATE_TABLE_VERSION,
  findVoicingFamilyTemplate,
  initializeVoiceFrame,
  type SemanticRealization,
  type UnassignedVoice,
  type UnassignedVoiceFrame,
  type VoiceRoleDegrees,
  type VoicingCandidate,
} from "../theory";

/** The stable role-source name for frames built from stored pitches. */
export const STUDIO_STORED_FRAME_SOURCE_ID = "studio.stored-voicing";

/** The V1 request id used only to gate stored frames through validation. */
const STORED_FRAME_GATE_REQUEST_ID = "studio-stored-frame-gate";

function compareDegrees(left: ChordDegree, right: ChordDegree): number {
  if (left.number !== right.number) return left.number - right.number;
  return left.alter - right.alter;
}

function sameDegree(left: ChordDegree, right: ChordDegree): boolean {
  return left.number === right.number && left.alter === right.alter;
}

/** Order by degree number then alteration and drop duplicates, per V1 law. */
function roleDegrees(degrees: readonly ChordDegree[]): VoiceRoleDegrees {
  const sorted = [...degrees].sort(compareDegrees);
  const deduped: ChordDegree[] = [];
  for (const degree of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous === undefined || !sameDegree(previous, degree)) {
      deduped.push(degree);
    }
  }
  // T1 caps realization degrees at the V1 role-degree bound, so the checked
  // array is a member of the bounded tuple union.
  return Object.freeze(deduped) as VoiceRoleDegrees;
}

/**
 * The candidate's static color degrees: the `"color"`-role slots of its own
 * template row. Only fixed-degree-sequence rows declare any.
 */
function candidateColorDegrees(
  candidate: VoicingCandidate,
): readonly ChordDegree[] {
  const template = findVoicingFamilyTemplate(
    candidate.explanation.qualityClass,
    candidate.family,
  );
  if (!("degreeSequence" in template)) return [];
  if (template.id !== candidate.explanation.templateId) return [];
  return template.degreeSequence
    .filter((slot) => slot.role === "color")
    .map((slot) => slot.degree);
}

function membership(
  degree: ChordDegree | null,
  degrees: VoiceRoleDegrees,
): boolean {
  if (degree === null) return false;
  return degrees.some((member) => sameDegree(member, degree));
}

/**
 * One V0 retained candidate as a V1 unassigned frame. The voices are the
 * candidate's voices verbatim plus the two role booleans, which are derived
 * with the same membership predicate V1 revalidates.
 */
export function candidateVoiceFrame(
  eventId: ChordEventId,
  candidate: VoicingCandidate,
  realization: SemanticRealization,
): UnassignedVoiceFrame {
  const guideDegrees = roleDegrees(realization.guideToneDegrees);
  const colorDegrees = roleDegrees(candidateColorDegrees(candidate));
  const voices: UnassignedVoice[] = candidate.voices.map((voice) =>
    Object.freeze({
      ...voice,
      guideTone: membership(voice.degree, guideDegrees),
      colorTone: membership(voice.degree, colorDegrees),
    }),
  );
  return Object.freeze({
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "unassigned",
    eventId,
    roles: Object.freeze({
      policyId: VOICE_ASSIGNMENT_ROLE_POLICY_ID,
      policyVersion: VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
      sourceId: candidate.explanation.templateId,
      sourceVersion: VOICING_TEMPLATE_TABLE_VERSION,
      candidateId: candidate.id,
      realizationId: candidate.realizationId,
      guideDegrees,
      colorDegrees,
    }),
    // The candidate's 3..7-voice bound carries through the verbatim copy.
    voices: Object.freeze(voices) as UnassignedVoiceFrame["voices"],
  });
}

/**
 * A stored Manual/Frozen voicing as a V1 frame, so a fixed chord can anchor
 * voice leading on both sides without ever being regenerated. Returns null
 * when the stored pitches cannot form a legal V1 frame (a pitch outside
 * MIDI, fewer than three or more than seven voices, or a duplicate MIDI);
 * the caller then breaks the optimization chain around the event instead of
 * pretending to know how the voices move through it.
 *
 * Stored pitches carry no chord degrees, so every voice uses the slash-bass
 * provenance — V0's only degree-free voice shape — with empty role sets.
 * The finished frame is gated through the real V1 frame validator; nothing
 * here re-derives V1's frame laws.
 */
export function storedVoiceFrame(
  eventId: ChordEventId,
  voicing: ManualVoicing | FrozenVoicing,
): UnassignedVoiceFrame | null {
  const projected: { pitch: SpelledPitch; midi: MidiPitch }[] = [];
  for (const pitch of voicing.pitches) {
    const projection = projectSpelledPitch(pitch);
    if (!projection.ok) return null;
    projected.push({ pitch, midi: projection.value.midi });
  }
  projected.sort((left, right) => left.midi - right.midi);
  const voices: UnassignedVoice[] = projected.map((voice, ordinal) =>
    Object.freeze({
      ordinal,
      pitch: voice.pitch,
      midi: voice.midi,
      provenance: "slash-bass" as const,
      degree: null,
      sourceDegreeIndex: null,
      guideTone: false,
      colorTone: false,
    }),
  );
  if (voices.length < 3 || voices.length > 7) return null;
  const empty = roleDegrees([]);
  const frame: UnassignedVoiceFrame = Object.freeze({
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "unassigned",
    eventId,
    roles: Object.freeze({
      policyId: VOICE_ASSIGNMENT_ROLE_POLICY_ID,
      policyVersion: VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
      sourceId: STUDIO_STORED_FRAME_SOURCE_ID,
      sourceVersion: 1,
      candidateId: VOICING_CANDIDATE_IDS[0],
      realizationId: SEMANTIC_REALIZATION_IDS[0],
      guideDegrees: empty,
      colorDegrees: empty,
    }),
    // The 3..7 length is checked immediately above.
    voices: Object.freeze(voices) as UnassignedVoiceFrame["voices"],
  });
  const gated = initializeVoiceFrame({
    schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
    kind: "initialize",
    requestId: STORED_FRAME_GATE_REQUEST_ID,
    frame,
  });
  return gated.ok ? frame : null;
}
