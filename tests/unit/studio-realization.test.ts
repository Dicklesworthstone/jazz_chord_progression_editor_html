/**
 * jcpe-26u1 phase (b) evidence: playback voicings are selected by the V2
 * progression optimizer over real V0 candidates, deterministically, with
 * Manual/Frozen pitches untouched and playback never blocked by optimization.
 *
 * Expectations are measured against the production V1 voice-assignment
 * engine (the very cost model V2 minimizes) and against V0's own first
 * retained candidate — the pre-optimizer selection — never against the
 * module under test's own output.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

/* The playability proof renders real piano buffers; wall time is not a gate. */
setDefaultTimeout(120_000);

import { validateDocumentSemantics } from "../../src/application";
import { buildStudioRealizations } from "../../src/application/studio-realization";
import { candidateVoiceFrame } from "../../src/application/studio-voicing-frames";
import {
  createStudioAudio,
  createStudioController,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import {
  PROGRESSION_DOCUMENT_SCHEMA,
  decodeDocumentShape,
  parseStableId,
  type ChordEventId,
  type ValidatedDocument,
} from "../../src/domain";
import type {
  GeneratedPlaybackRealizationBinding,
  PlaybackRealizationMap,
} from "../../src/playback";
import {
  VOICE_ASSIGNMENT_POLICY_ID,
  VOICE_ASSIGNMENT_POLICY_VERSION,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA,
  assignVoiceTransition,
  initializeVoiceFrame,
  parseChordSymbol,
  realizeVoicing,
  type SemanticRealization,
  type UnassignedVoiceFrame,
  type VoicingCandidate,
} from "../../src/theory";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const AUTO_BALANCED = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

const AUTO_ROOTLESS = Object.freeze({
  mode: "auto",
  family: "rootless-a",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "external",
});

type EventSeed = Readonly<{
  id: string;
  chord: string;
  beats: number;
  voicing?: unknown;
}>;

function eventIdOf(wire: string): ChordEventId {
  const parsed = parseStableId("event", wire);
  if (!parsed.ok) throw new Error(`STUDIO_REALIZATION_TEST_ID:${wire}`);
  return parsed.value;
}

function parsedChord(sourceText: string) {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`STUDIO_REALIZATION_TEST_CHORD:${sourceText}`);
  return parsed.chord;
}

/** Publish one single-section document through the real F2+F3 pipeline. */
function publishDocument(
  measures: readonly (readonly EventSeed[])[],
  documentId = "document-studio-realization-test",
): ValidatedDocument {
  const candidate = {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: documentId,
    title: "Studio realization evidence",
    description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    key: null,
    sections: [
      {
        id: "section-studio-realization",
        name: "A",
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "reset",
        measures: measures.map((events, index) => ({
          id: `measure-studio-realization-${String(index)}`,
          events: events.map((event) => ({
            id: event.id,
            chord: parsedChord(event.chord),
            voicing: event.voicing ?? AUTO_BALANCED,
            duration: { numerator: event.beats, denominator: 1 },
            annotation: "",
          })),
          completion: { kind: "complete" },
        })),
      },
    ],
    playback: {
      instrumentId: "concert-grand",
      masterVolume: 0.9,
      reverbAmount: 0.3,
      countInBars: 0,
    },
  };
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) {
    throw new Error(`STUDIO_REALIZATION_TEST_F2:${decoded.errors[0].code}`);
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(`STUDIO_REALIZATION_TEST_F3:${published.errors[0].code}`);
  }
  return published.value;
}

function buildRealizations(document: ValidatedDocument): PlaybackRealizationMap {
  const built = buildStudioRealizations(document);
  if (!built.ok) {
    throw new Error(`STUDIO_REALIZATION_TEST_BUILD:${built.refusal.code}`);
  }
  return built.realizations;
}

function generatedBinding(
  realizations: PlaybackRealizationMap,
  wire: string,
): GeneratedPlaybackRealizationBinding & {
  outcome: { ok: true; candidate: VoicingCandidate };
} {
  const binding = realizations.get(eventIdOf(wire));
  if (!binding || binding.kind !== "generated" || !binding.outcome.ok) {
    throw new Error(`STUDIO_REALIZATION_TEST_BINDING:${wire}`);
  }
  return binding as GeneratedPlaybackRealizationBinding & {
    outcome: { ok: true; candidate: VoicingCandidate };
  };
}

/** The realization the binding's own request selected, for frame building. */
function requestRealization(
  binding: GeneratedPlaybackRealizationBinding,
): SemanticRealization {
  const found = binding.request.resolved.realizations.find(
    (realization) => realization.id === binding.request.realizationId,
  );
  if (!found) throw new Error("STUDIO_REALIZATION_TEST_REALIZATION");
  return found;
}

/** All 24-or-fewer retained candidates for the binding's exact request. */
function retainedCandidates(
  binding: GeneratedPlaybackRealizationBinding,
): readonly VoicingCandidate[] {
  const generated = realizeVoicing(binding.request);
  if (!generated.ok) {
    throw new Error(`STUDIO_REALIZATION_TEST_V0:${generated.refusal.code}`);
  }
  return generated.value.candidates;
}

/**
 * The V1-measured cost of sounding one candidate per event in order: total
 * matched-voice motion in semitones and exactly sustained pitches, straight
 * from the production voice-assignment engine.
 */
function measureChain(frames: readonly UnassignedVoiceFrame[]): Readonly<{
  motion: number;
  exactSustains: number;
}> {
  let motion = 0;
  let exactSustains = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const from = frames[index - 1];
    const to = frames[index];
    if (!from || !to) throw new Error("STUDIO_REALIZATION_TEST_FRAME");
    const initialized = initializeVoiceFrame({
      schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
      kind: "initialize",
      requestId: "studio-realization-test",
      frame: from,
    });
    if (!initialized.ok) {
      throw new Error(`STUDIO_REALIZATION_TEST_V1:${initialized.refusal.code}`);
    }
    const transition = assignVoiceTransition({
      schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
      kind: "transition",
      requestId: "studio-realization-test",
      from: initialized.value.frame,
      to,
      locks: [],
      policyId: VOICE_ASSIGNMENT_POLICY_ID,
      policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION,
    });
    if (!transition.ok) {
      throw new Error(`STUDIO_REALIZATION_TEST_V1:${transition.refusal.code}`);
    }
    motion += transition.value.cost.totalAbsoluteMotion;
    exactSustains += transition.value.cost.exactSustains;
  }
  return Object.freeze({ motion, exactSustains });
}

/** The Deacon Blues starter progression, bar for bar. */
const DEACON_MEASURES: readonly (readonly EventSeed[])[] = [
  [
    { id: "event-deacon-00", chord: "Cmaj7", beats: 2 },
    { id: "event-deacon-01", chord: "Bm7#5", beats: 2 },
  ],
  [
    { id: "event-deacon-02", chord: "Bbmaj7", beats: 2 },
    { id: "event-deacon-03", chord: "Am7#5", beats: 2 },
  ],
  [
    { id: "event-deacon-04", chord: "Dmaj7", beats: 2 },
    { id: "event-deacon-05", chord: "C#m7#5", beats: 2 },
  ],
  [
    { id: "event-deacon-06", chord: "Cmaj7", beats: 2 },
    { id: "event-deacon-07", chord: "Bm7#5", beats: 2 },
  ],
  [{ id: "event-deacon-08", chord: "Ebmaj7", beats: 4 }],
  [{ id: "event-deacon-09", chord: "E7#9", beats: 4 }],
];

const DEACON_EVENT_WIRES = DEACON_MEASURES.flat().map((event) => event.id);

describe("V2-selected playback voicings", () => {
  test("two builds over the Deacon document select identical candidates", () => {
    const first = buildRealizations(publishDocument(DEACON_MEASURES));
    const second = buildRealizations(publishDocument(DEACON_MEASURES));
    const selectionOf = (realizations: PlaybackRealizationMap) =>
      DEACON_EVENT_WIRES.map((wire) => {
        const binding = generatedBinding(realizations, wire);
        return {
          wire,
          candidateId: binding.outcome.candidate.id,
          midi: binding.outcome.candidate.voices.map((voice) => voice.midi),
        };
      });
    const firstSelection = selectionOf(first);
    expect(firstSelection).toEqual(selectionOf(second));
    // Every event is bound and playable-shaped: 3..7 concrete pitches.
    for (const entry of firstSelection) {
      expect(entry.midi.length).toBeGreaterThanOrEqual(3);
      expect(entry.midi.length).toBeLessThanOrEqual(7);
    }
  });

  test("one document object is realized once, not once per compile", () => {
    /*
     * Selecting across the chart is hundreds of milliseconds of V1 oracle
     * calls, and the controller compiles a fresh plan on every Play AND every
     * chord click. Repeating that work for a document that cannot have
     * changed is the difference between a chord click sounding at once and
     * blocking the page; the memo is keyed by the frozen document object, so
     * the second build must return the very same binding map.
     */
    const document = publishDocument(DEACON_MEASURES);
    const first = buildStudioRealizations(document);
    const second = buildStudioRealizations(document);
    if (!first.ok || !second.ok) throw new Error("STUDIO_REALIZATION_TEST_MEMO");
    expect(second.realizations).toBe(first.realizations);

    /* A different document object recomputes, even sharing id and event ids. */
    const edited = publishDocument([
      [{ id: "event-deacon-00", chord: "Fmaj7", beats: 4 }],
    ]);
    const rebuilt = buildStudioRealizations(edited);
    if (!rebuilt.ok) throw new Error("STUDIO_REALIZATION_TEST_MEMO_STALE");
    expect(rebuilt.realizations).not.toBe(first.realizations);
    expect(
      generatedBinding(rebuilt.realizations, "event-deacon-00").request.resolved
        .source.sourceText,
    ).toBe("Fmaj7");
  });

  test("selection beats the naive first-candidate chain under the real V1 cost", () => {
    const document = publishDocument([
      [{ id: "event-lead-0", chord: "Cmaj7", beats: 4 }],
      [{ id: "event-lead-1", chord: "Fmaj7", beats: 4 }],
      [{ id: "event-lead-2", chord: "Cmaj7", beats: 4 }],
    ]);
    const realizations = buildRealizations(document);
    const wires = ["event-lead-0", "event-lead-1", "event-lead-2"];

    const optimizedFrames: UnassignedVoiceFrame[] = [];
    const naiveFrames: UnassignedVoiceFrame[] = [];
    const optimizedIds: string[] = [];
    const naiveIds: string[] = [];
    for (const wire of wires) {
      const binding = generatedBinding(realizations, wire);
      const realization = requestRealization(binding);
      const candidates = retainedCandidates(binding);
      const naive = candidates[0];
      if (!naive) throw new Error("STUDIO_REALIZATION_TEST_EMPTY");
      optimizedIds.push(binding.outcome.candidate.id);
      naiveIds.push(naive.id);
      optimizedFrames.push(
        candidateVoiceFrame(eventIdOf(wire), binding.outcome.candidate, realization),
      );
      naiveFrames.push(candidateVoiceFrame(eventIdOf(wire), naive, realization));
    }

    // The optimizer made a real choice: not just candidates[0] everywhere.
    expect(optimizedIds).not.toEqual(naiveIds);

    // And the choice is better voice leading by the very engine that owns
    // the cost: strictly less matched-voice motion, no fewer held pitches.
    const optimized = measureChain(optimizedFrames);
    const naive = measureChain(naiveFrames);
    expect(optimized.motion).toBeLessThan(naive.motion);
    expect(optimized.exactSustains).toBeGreaterThanOrEqual(naive.exactSustains);
  });

  test("every retained candidate frame satisfies the real V1 frame laws", () => {
    const document = publishDocument([
      [{ id: "event-frame-0", chord: "Cmaj7", beats: 4 }],
      [{ id: "event-frame-1", chord: "C13", beats: 4, voicing: AUTO_ROOTLESS }],
    ]);
    const realizations = buildRealizations(document);
    let rootlessColorFrames = 0;
    for (const wire of ["event-frame-0", "event-frame-1"]) {
      const binding = generatedBinding(realizations, wire);
      const realization = requestRealization(binding);
      for (const candidate of retainedCandidates(binding)) {
        const frame = candidateVoiceFrame(eventIdOf(wire), candidate, realization);
        const gate = initializeVoiceFrame({
          schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
          kind: "initialize",
          requestId: "studio-realization-test",
          frame,
        });
        expect(
          gate.ok ? "accepted" : `${candidate.id}:${gate.refusal.code}`,
        ).toBe("accepted");
        if (wire === "event-frame-1" && frame.roles.colorDegrees.length > 0) {
          rootlessColorFrames += 1;
          // The color flags follow template color-slot membership exactly.
          for (const voice of frame.voices) {
            const voiceDegree = voice.degree;
            const member =
              voiceDegree !== null &&
              frame.roles.colorDegrees.some(
                (degree) =>
                  degree.number === voiceDegree.number &&
                  degree.alter === voiceDegree.alter,
              );
            expect(voice.colorTone).toBe(member);
          }
        }
      }
    }
    // The rootless template owns static color slots (9, 13), so its frames
    // must actually carry a color set; adaptive balanced frames carry none.
    expect(rootlessColorFrames).toBeGreaterThan(0);
  });

  test("Manual voicings pass through untouched beside optimized neighbors", () => {
    const manualPitches = [
      { step: "C", alter: 0, octave: 3 },
      { step: "G", alter: 0, octave: 3 },
      { step: "E", alter: 0, octave: 4 },
      { step: "B", alter: 0, octave: 4 },
    ] as const;
    const document = publishDocument([
      [{ id: "event-mixed-0", chord: "Cmaj7", beats: 4 }],
      [
        {
          id: "event-mixed-1",
          chord: "Cmaj7",
          beats: 4,
          voicing: {
            mode: "manual",
            pitches: manualPitches,
            bassPolicy: "included",
          },
        },
      ],
      [{ id: "event-mixed-2", chord: "Fmaj7", beats: 4 }],
    ]);
    const realizations = buildRealizations(document);

    const stored = realizations.get(eventIdOf("event-mixed-1"));
    if (!stored || stored.kind !== "stored") {
      throw new Error("STUDIO_REALIZATION_TEST_STORED");
    }
    expect(stored.result.kind).toBe("stored-bypass");
    expect(stored.result.candidateGenerationPerformed).toBe(false);
    expect(stored.result.voicing.mode).toBe("manual");
    expect(
      stored.result.voicing.pitches.map((pitch) => ({
        step: pitch.step,
        alter: pitch.alter,
        octave: pitch.octave,
      })),
    ).toEqual([...manualPitches]);

    // Both auto neighbors still resolve to concrete candidates.
    expect(generatedBinding(realizations, "event-mixed-0").outcome.ok).toBe(true);
    expect(generatedBinding(realizations, "event-mixed-2").outcome.ok).toBe(true);
  });

  test("an optimized chart still PLAYS through the real transport", () => {
    const audio = createStudioAudio(createFakeAudioPlatform().platform);
    const creation = createStudioController({ audio });
    if (!creation.ok) {
      throw new Error(`STUDIO_REALIZATION_TEST_CTRL:${creation.refusal.code}`);
    }
    const controller: StudioController = creation.controller;
    const snapshot = controller.getSnapshot();
    const measureId = snapshot.sections[0]?.measures[0]?.id ?? "";
    const sectionId = snapshot.sections[0]?.id ?? "";
    // The insertion-plan vocabulary has no fill-and-append statement, so the
    // chart lands like the starter seed: first bar fills the pristine
    // measure, the remainder appends at the section end.
    const inserts: readonly (readonly [
      string,
      Parameters<StudioController["setQuickEntryDraft"]>[1],
    ])[] = [
      ["| Cmaj7 |", { kind: "measure-start", measureId }],
      ["| Fmaj7 | Cmaj7 |", { kind: "section-end", sectionId }],
    ];
    for (const [chart, target] of inserts) {
      const preview = controller.previewChartText(chart);
      expect(preview.status).toBe("ready");
      const drafted = controller.setQuickEntryDraft(
        chart,
        target,
        preview.status,
        preview.issueCodes,
      );
      expect(drafted.ok).toBe(true);
      const applied = controller.applyQuickEntryPreview();
      expect(applied.ok).toBe(true);
    }
    const played = controller.playProgression({
      kind: "trusted-pointer",
      trusted: true,
      sequence: 1,
    });
    expect(played.ok ? "plays" : played.refusal.message).toBe("plays");
    expect(controller.stopProgression().ok).toBe(true);
  });
});
