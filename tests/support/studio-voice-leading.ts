import { validateDocumentSemantics } from "../../src/application";
import { buildStudioRealizations } from "../../src/application/studio-realization";
import { candidateVoiceFrame } from "../../src/application/studio-voicing-frames";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import type { PlaybackPlan } from "../../src/playback";
import { PROGRESSION_DOCUMENT_SCHEMA, decodeDocumentShape, type ValidatedDocument } from "../../src/domain";
import { parseChordSymbol, realizeVoicing, type ProgressionOptimizationRequest } from "../../src/theory";
import { continuityRequest, required, realVoiceOperations } from "./progression-continuity";
import { runToTerminal } from "./progression-optimizer-test-kit";

export const MUSICAL_CHAINS = [
  { id: "ii-V-I", bars: [["Dm7"], ["G7"], ["Cmaj7"]] },
  { id: "Deacon-Blues", bars: [["Cmaj7", "Bm7#5"], ["Bbmaj7", "Am7#5"], ["Dmaj7", "C#m7#5"], ["Cmaj7", "Bm7#5"], ["Ebmaj7"], ["E7#9"]] },
  { id: "Autumn-Leaves", bars: [["Am7"], ["D7"], ["Gmaj7"], ["Cmaj7"], ["F#m7b5"], ["B7"], ["Em7"]] },
  { id: "Giant-Steps", bars: [["Bmaj7", "D7"], ["Gmaj7", "Bb7"], ["Ebmaj7"], ["Am7", "D7"], ["Gmaj7", "Bb7"], ["Ebmaj7", "F#7"], ["Bmaj7"]] },
] as const;

export function musicalDocument(bars: readonly (readonly string[])[], stored?: unknown): ValidatedDocument {
  let ordinal = 0;
  const decoded = decodeDocumentShape({
    schema: PROGRESSION_DOCUMENT_SCHEMA, id: "document-continuity", title: "Continuity", description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 }, tempoBpm: 120, key: null,
    sections: [{ id: "section-continuity", name: "A", annotation: "", keyOverride: null, voiceLeadingBoundary: "reset",
      measures: bars.map((chords, i) => ({ id: `measure-continuity-${String(i)}`, completion: { kind: "complete" },
        events: chords.map((chord) => {
          const parsed = parseChordSymbol(chord, "ascii");
          if (!parsed.ok) throw new Error("Invalid test chord");
          const index = ordinal++;
          return { id: `event-continuity-${String(index)}`, chord: parsed.chord,
            duration: { numerator: 4 / chords.length, denominator: 1 }, annotation: "",
            voicing: index === 1 && stored !== undefined ? stored : {
              mode: "auto", family: "balanced", voiceCount: 4,
              range: { lowMidi: 48, highMidi: 84 }, bassPolicy: "generated",
            } };
        }),
      })),
    }],
    playback: { instrumentId: "concert-grand", masterVolume: 0.9, reverbAmount: 0.3, countInBars: 0 },
  });
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
  return validated.value;
}

/** Public V0 candidates and real frames; no access to studio optimizer internals. */
export function studioCandidates(document: ValidatedDocument) {
  const built = buildStudioRealizations(document);
  if (!built.ok) throw new Error(built.refusal.code);
  const events = document.sections.flatMap((section) => section.measures.flatMap((measure) => measure.events));
  return events.map((event) => {
    const binding = built.realizations.get(event.id);
    if (binding?.kind !== "generated" || !binding.outcome.ok) throw new Error("Expected generated binding");
    const realized = realizeVoicing(binding.request);
    if (!realized.ok) throw new Error(realized.refusal.code);
    const semantic = binding.request.resolved.realizations.find((row) => row.id === binding.request.realizationId);
    if (!semantic) throw new Error("Missing realization");
    return { event, selected: candidateVoiceFrame(event.id, binding.outcome.candidate, semantic),
      candidates: realized.value.candidates.map((candidate) => candidateVoiceFrame(event.id, candidate, semantic)) };
  });
}

export function studioRequest(document: ValidatedDocument, version: 1 | 2): ProgressionOptimizationRequest {
  const base = continuityRequest([], version);
  return { ...base, identity: { ...base.identity, documentId: document.id },
    events: studioCandidates(document).map((row, index) => ({
      ...required(continuityRequest([[[60, 64, 67]]]).events, 0),
      kind: "auto", eventId: row.event.id, candidates: row.candidates,
      chainBoundary: index === 0 ? "reset" : "continue",
    })),
  };
}

/** Frozen arrangement-law fixtures retain their original policy-1 inputs.
 * Old expected outputs are untouched; new studio behavior has its own tests. */
export function legacyStudioPlan(document: ValidatedDocument): PlaybackPlan {
  const compiled = compileStudioPlaybackPlan(document);
  if (!compiled.ok) throw new Error(compiled.refusal.code);
  const outcome = runToTerminal(studioRequest(document, 1), realVoiceOperations).outcome;
  if (outcome.kind !== "optimized") throw new Error(outcome.kind);
  const ids = required(required(outcome.segments, 0).realizations, 0).candidateIds;
  const rows = studioCandidates(document);
  return Object.freeze({ ...compiled.plan, events: Object.freeze(compiled.plan.events.map((event, i) => {
    const frame = required(rows, i).candidates.find((candidate) => candidate.roles.candidateId === ids[i]);
    if (!frame) throw new Error("Missing legacy arrangement input");
    const [first, ...rest] = frame.voices;
    return Object.freeze({ ...event,
      pitches: Object.freeze([first.pitch, ...rest.map((v) => v.pitch)] as const),
      midiPitches: Object.freeze([first.midi, ...rest.map((v) => v.midi)] as const),
    });
  })) });
}
