import { expect, test } from "bun:test";

import {
  createAudioEngineWithWaveguideRenderersForTest,
} from "../../src/audio/audio-engine";
import type {
  RenderedNotePcm,
  WaveguideRenderer,
} from "../../src/audio/dsp-renderer";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import {
  attackRequest,
  midi,
  progressionOwner,
  requireFailure,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

const ALGORITHM_ID = "changes.dsp.plucked-dreadnought@1";
const MAX_RENDER_CALLS_BEFORE_FIRST_SOURCE = 1;
const CHORD_PITCHES = [60, 64, 67, 71] as const;

type RenderCalls = {
  note: number;
  chord: number;
};

/* Separate from RenderCalls so literal call-count toEqual assertions stay
 * exact; records the pitch list each chord render actually received. */
type ChordPitchLog = { last?: readonly number[] };

function deterministicPcm(
  pitches: readonly number[],
  sampleRateHz: number,
): RenderedNotePcm {
  const frameCount = 128;
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  /* Every string's first image starts at the same sample. */
  left[4] = pitches.length / 8;
  right[4] = pitches.reduce((sum, pitch) => sum + pitch, 0) / 1024;
  return Object.freeze({ sampleRateHz, frameCount, left, right });
}

function fakeDreadnoughtRenderer(
  calls: RenderCalls,
  pitchLog?: ChordPitchLog,
): WaveguideRenderer {
  return Object.freeze({
    algorithmId: ALGORITHM_ID,
    wasmSha256: "f012ce54".padEnd(64, "0"),
    renderNote: (midiPitch, _velocity, sampleRateHz) => {
      calls.note += 1;
      return deterministicPcm([midiPitch], sampleRateHz);
    },
    renderChord: (midiPitches, _velocities, sampleRateHz) => {
      calls.chord += 1;
      if (pitchLog !== undefined) pitchLog.last = [...midiPitches];
      return deterministicPcm(midiPitches, sampleRateHz);
    },
    renderChordCooperatively: async (
      midiPitches,
      _velocities,
      sampleRateHz,
    ) => {
      calls.chord += 1;
      if (pitchLog !== undefined) pitchLog.last = [...midiPitches];
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return deterministicPcm(midiPitches, sampleRateHz);
    },
  });
}

async function readyWithFakeRenderer(
  calls: RenderCalls,
  pitchLog?: ChordPitchLog,
) {
  const fake = createFakeAudioPlatform({ sampleRate: 48_000 });
  const renderer = fakeDreadnoughtRenderer(calls, pitchLog);
  const engine = createAudioEngineWithWaveguideRenderersForTest(
    fake.platform,
    new Map([[ALGORITHM_ID, renderer]]),
  );
  requireSuccess(
    await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    }),
  );
  const context = fake.contexts[0];
  if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
  return { engine, fake, context, renderer };
}

test("a cold attack never runs the slow renderer and a prepared chord is one sample-aligned source with atomic identities", async () => {
  const calls: RenderCalls = { note: 0, chord: 0 };
  const { engine, fake, context, renderer } = await readyWithFakeRenderer(calls);

  /* Planted old-path negative: sequential cold note rendering exceeds the
   * independently fixed one-render admission law before first audio. */
  for (const pitch of CHORD_PITCHES) {
    renderer.renderNote(pitch, 96, 48_000, 2);
  }
  expect(calls.note).toBe(CHORD_PITCHES.length);
  expect(calls.note).toBeGreaterThan(MAX_RENDER_CALLS_BEFORE_FIRST_SOURCE);
  calls.note = 0;

  const beforeBuffers = fake.events.filter(
    (event) => event.kind === "buffer-create",
  ).length;
  const beforeStarts = fake.events.filter(
    (event) => event.kind === "source-start",
  ).length;

  const request = attackRequest(
    CHORD_PITCHES.map((pitch, index) =>
      voice(`chord-voice-${String(index)}`, pitch, 96),
    ),
    {
      eventId: "event-shared-dreadnought-chord",
      instrumentId: "dreadnought-guitar",
      startTimeSeconds: 0.05,
      releaseTimeSeconds: 1.25,
    },
  );
  requireFailure(
    engine.attackAudioVoices(request),
    "audio.renderer_unavailable",
  );
  expect(calls).toEqual({ note: 0, chord: 0 });
  expect(
    fake.events.filter((event) => event.kind === "buffer-create").length,
  ).toBe(beforeBuffers);
  expect(
    fake.events.filter((event) => event.kind === "source-start").length,
  ).toBe(beforeStarts);

  expect(requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: CHORD_PITCHES.map((pitch) => ({
      midiPitch: midi(pitch),
      velocity: 96,
    })),
  }))).toMatchObject({ renderedCount: 1, cachedCount: 0 });
  expect(calls).toEqual({ note: 0, chord: 1 });

  const attack = requireSuccess(
    engine.attackAudioVoices(request),
  );

  expect(calls).toEqual({ note: 0, chord: 1 });
  expect(
    fake.events.filter((event) => event.kind === "buffer-create").length -
      beforeBuffers,
  ).toBe(1);
  const starts = fake.events
    .filter((event) => event.kind === "source-start")
    .slice(beforeStarts);
  expect(starts).toHaveLength(1);
  expect(starts[0]?.atTimeSeconds).toBe(0.05);

  const active = attack.snapshot.activeVoices
    .filter((activeVoice) =>
      activeVoice.eventId === "event-shared-dreadnought-chord"
    )
    .sort((left, right) => left.voiceId.localeCompare(right.voiceId));
  expect(active.map((activeVoice) => activeVoice.midiPitch)).toEqual(
    CHORD_PITCHES.map(midi),
  );
  expect(active.map((activeVoice) => activeVoice.scheduledSourceCount)).toEqual(
    [1, 0, 0, 0],
  );
  expect(active.map((activeVoice) => activeVoice.velocityGain)).toEqual(
    [1, 1, 1, 1],
  );

  /* Retiring any logical member retires the composite source and every
   * sibling at the exact same instant, before the source-ended callback. */
  context.setCurrentTime(0.2);
  const retired = requireSuccess(engine.retireAudioVoices({
    selector: { kind: "voice-ids", voiceIds: ["chord-voice-2"] },
    reason: "all-notes-off",
    atTimeSeconds: 0.2,
  }));
  const retiringChord = retired.snapshot.activeVoices.filter(
    (activeVoice) =>
      activeVoice.eventId === "event-shared-dreadnought-chord",
  );
  expect(retiringChord).toHaveLength(4);
  expect(new Set(retiringChord.map((activeVoice) =>
    activeVoice.effectiveReleaseTimeSeconds
  ))).toEqual(new Set([0.2]));
  expect(new Set(retiringChord.map((activeVoice) =>
    activeVoice.cleanupDeadlineSeconds
  )).size).toBe(1);
  expect(retiringChord.every((activeVoice) =>
    activeVoice.phase === "releasing"
  )).toBe(true);

  /* The composite source owns the whole chord's natural-end cleanup. */
  context.finishAllSources();
  expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);

  requireSuccess(engine.attackAudioVoices(attackRequest(
    CHORD_PITCHES.map((pitch, index) =>
      voice(`chord-voice-${String(index)}`, pitch, 96),
    ),
    {
      eventId: "event-shared-dreadnought-chord",
      instrumentId: "dreadnought-guitar",
      startTimeSeconds: 0.25,
      releaseTimeSeconds: 1.45,
    },
  )));
  const eventRetirement = requireSuccess(engine.retireAudioVoices({
    selector: {
      kind: "event",
      owner: progressionOwner(),
      eventId: "event-shared-dreadnought-chord",
    },
    reason: "all-notes-off",
    atTimeSeconds: 0.25,
  }));
  expect(eventRetirement.matchedVoiceIds).toHaveLength(4);
  expect(eventRetirement.newlyRetiredVoiceIds).toHaveLength(4);
  expect(eventRetirement.alreadyRetiringVoiceIds).toEqual([]);
});

test("the composite cache binds pitch order, quantized velocity, and gate bucket", async () => {
  const calls: RenderCalls = { note: 0, chord: 0 };
  const pitchLog: ChordPitchLog = {};
  const { engine } = await readyWithFakeRenderer(calls, pitchLog);
  const prepare = (
    pitches: readonly number[],
    velocity: number,
    gateSeconds?: number,
  ) => engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: pitches.map((pitch) => ({
      midiPitch: midi(pitch),
      velocity,
      ...(gateSeconds === undefined ? {} : { gateSeconds }),
    })),
  });

  expect(requireSuccess(await prepare(CHORD_PITCHES, 96))).toMatchObject({
    renderedCount: 1,
    cachedCount: 0,
  });
  expect(calls).toEqual({ note: 0, chord: 1 });

  /* 96 and 100 occupy the same reviewed render-velocity band. */
  expect(requireSuccess(await prepare(CHORD_PITCHES, 100))).toMatchObject({
    renderedCount: 0,
    cachedCount: 1,
  });
  expect(calls.chord).toBe(1);

  expect(
    requireSuccess(await prepare([...CHORD_PITCHES].reverse(), 100)),
  ).toMatchObject({ renderedCount: 0, cachedCount: 1 });
  expect(calls.chord).toBe(1);

  expect(
    requireSuccess(await prepare([...CHORD_PITCHES].reverse(), 70)),
  ).toMatchObject({ renderedCount: 1, cachedCount: 0 });
  expect(calls.chord).toBe(2);

  /* 2.6 seconds (2.0 gate + release + tail) moves from bucket 2 to 4. */
  expect(
    requireSuccess(await prepare([...CHORD_PITCHES].reverse(), 70, 2)),
  ).toMatchObject({ renderedCount: 1, cachedCount: 0 });
  expect(calls.chord).toBe(3);

  const pairNotes = [
    { midiPitch: midi(60), velocity: 25 },
    { midiPitch: midi(67), velocity: 115 },
  ] as const;
  expect(requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: pairNotes,
  }))).toMatchObject({ renderedCount: 1, cachedCount: 0 });
  expect(calls.chord).toBe(4);
  expect(requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: [...pairNotes].reverse(),
  }))).toMatchObject({ renderedCount: 0, cachedCount: 1 });
  expect(calls.chord).toBe(4);

  const forward = requireSuccess(engine.attackAudioVoices(attackRequest([
    voice("pair-forward-soft", 60, 25),
    voice("pair-forward-loud", 67, 115),
  ], {
    eventId: "event-pair-forward",
    instrumentId: "dreadnought-guitar",
    startTimeSeconds: 0.05,
    releaseTimeSeconds: 1.25,
  })));
  const reverse = requireSuccess(engine.attackAudioVoices(attackRequest([
    voice("pair-reverse-loud", 67, 115),
    voice("pair-reverse-soft", 60, 25),
  ], {
    eventId: "event-pair-reverse",
    instrumentId: "dreadnought-guitar",
    startTimeSeconds: 0.05,
    releaseTimeSeconds: 1.25,
  })));
  expect(forward.velocityGains).toEqual([1, 1]);
  expect(reverse.velocityGains).toEqual([1, 1]);
  expect(forward.normalizationGain).toBe(reverse.normalizationGain);
  expect(calls.chord).toBe(4);

  /* Course-capacity voicing: a 7-note chart chord keeps its lowest 6
   * pitches on a 6-course dreadnought and renders one chord buffer. The
   * voiced 6-note request must then be a cache hit under the same key. */
  const beforeVoiced = { ...calls };
  expect(requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: [48, 50, 52, 53, 55, 57, 59].map((pitch) => ({
      midiPitch: midi(pitch),
      velocity: 96,
    })),
  }))).toMatchObject({ renderedCount: 1, cachedCount: 0 });
  expect(calls.chord).toBe(beforeVoiced.chord + 1);
  /* Capacity voicing keeps the lowest six, then assignability voicing
   * mirrors plk2_chord_string_frets: the close cluster 48-57 cannot occupy
   * six distinct courses at fret 0..=24 on standard tuning and sits at the
   * instrument floor (no octave shift available), so the top voices drop
   * until the chord is playable — deterministic, never silently mangled. */
  expect(pitchLog.last).toEqual([48, 50, 52]);
  expect(requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: [48, 50, 52, 53, 55, 57].map((pitch) => ({
      midiPitch: midi(pitch),
      velocity: 96,
    })),
  }))).toMatchObject({ renderedCount: 0, cachedCount: 1 });
  expect(calls.chord).toBe(beforeVoiced.chord + 1);

  /* The 12-voice group ceiling is checked on the raw group BEFORE capacity
   * voicing: no legitimate chart event carries 13 voices, so a 13-note
   * gesture-less pseudo-group refuses without touching the renderer. */
  const beforeExtreme = { ...calls };
  requireFailure(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: Array.from({ length: 13 }, (_, index) => ({
      midiPitch: midi(36 + index),
      velocity: 96,
    })),
  }), "audio.renderer_unavailable");
  expect(calls).toEqual(beforeExtreme);
});

test("render-ahead warms a single plucked event cooperatively and attack remains cache-only", async () => {
  const calls: RenderCalls = { note: 0, chord: 0 };
  const { engine } = await readyWithFakeRenderer(calls);
  const note = Object.freeze({
    midiPitch: midi(48),
    velocity: 96,
    gateSeconds: 0.4,
  });

  requireFailure(engine.attackAudioVoices(attackRequest([
    voice("cold-cooperative-bass-note", 48, 96),
  ], {
    eventId: "event-cold-cooperative-bass-note",
    instrumentId: "dreadnought-guitar",
    startTimeSeconds: 0.05,
    releaseTimeSeconds: 0.45,
  })), "audio.renderer_unavailable");
  expect(calls).toEqual({ note: 0, chord: 0 });

  expect(requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: [note],
  }))).toMatchObject({ renderedCount: 1, cachedCount: 0 });
  expect(calls).toEqual({ note: 0, chord: 1 });

  requireSuccess(engine.attackAudioVoices(attackRequest([
    voice("cooperative-bass-note", 48, 96),
  ], {
    eventId: "event-cooperative-bass-note",
    instrumentId: "dreadnought-guitar",
    startTimeSeconds: 0.05,
    releaseTimeSeconds: 0.45,
  })));
  expect(calls).toEqual({ note: 0, chord: 1 });
});

test("a newer preparation generation cancels the older multi-group pipeline", async () => {
  const calls: RenderCalls = { note: 0, chord: 0 };
  const { engine } = await readyWithFakeRenderer(calls);

  let resolveSecond: (() => void) | null = null;
  const secondFinished = new Promise<void>((resolve) => {
    resolveSecond = resolve;
  });
  setTimeout(() => {
    void engine.prepareRenderedAudioVoices({
      instrumentId: "dreadnought-guitar",
      notes: [72, 76].map((pitch) => ({
        midiPitch: midi(pitch),
        velocity: 96,
        gateSeconds: 0.1,
      })),
    }).then((result) => {
      requireSuccess(result);
      resolveSecond?.();
    });
  }, 0);

  const superseded = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "dreadnought-guitar",
      notes: [
        { midiPitch: midi(48), velocity: 96, gateSeconds: 0.1 },
        { midiPitch: midi(52), velocity: 96, gateSeconds: 0.1 },
        { midiPitch: midi(55), velocity: 96, gateSeconds: 2 },
        { midiPitch: midi(59), velocity: 96, gateSeconds: 2 },
      ],
    }),
  );
  await secondFinished;

  /* First generation rendered only its first group; without the generation
   * check it resumes after the yield and renders a third, obsolete group. */
  expect(superseded).toMatchObject({
    renderedCount: 1,
    cachedCount: 0,
    completed: false,
  });
  expect(calls).toEqual({ note: 0, chord: 2 });
});

test("an oscillator preparation cannot cancel physical render-ahead", async () => {
  const calls: RenderCalls = { note: 0, chord: 0 };
  const { engine } = await readyWithFakeRenderer(calls);
  let resolveOscillator = (): void => {
    throw new Error("OSCILLATOR_PREPARATION_GATE_UNINITIALIZED");
  };
  const oscillatorFinished = new Promise<void>((resolve) => {
    resolveOscillator = resolve;
  });
  setTimeout(() => {
    void engine.prepareRenderedAudioVoices({
      instrumentId: "mellow-keys",
      notes: [{ midiPitch: midi(72), velocity: 96 }],
    }).then((result) => {
      expect(requireSuccess(result)).toMatchObject({
        renderedCount: 0,
        cachedCount: 0,
        completed: true,
      });
      resolveOscillator();
    });
  }, 0);

  const physical = requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "dreadnought-guitar",
    notes: [
      { midiPitch: midi(48), velocity: 96, gateSeconds: 0.1 },
      { midiPitch: midi(52), velocity: 96, gateSeconds: 0.1 },
      { midiPitch: midi(55), velocity: 96, gateSeconds: 2 },
      { midiPitch: midi(59), velocity: 96, gateSeconds: 2 },
    ],
  }));
  await oscillatorFinished;

  expect(physical).toMatchObject({
    renderedCount: 2,
    cachedCount: 0,
    completed: true,
  });
  expect(calls).toEqual({ note: 0, chord: 2 });
});
