import { expect, test } from "bun:test";

import {
  attackRequest,
  midi,
  readyEngine,
  requireFailure,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

/*
 * Gate-aware preparation: a warmed note must be a cache hit for the bucket
 * the attack path actually requests (gate + recipe release + tail), not just
 * the historical fixed preparation bucket. Sustained chords otherwise warm
 * one bucket and re-render a longer one inside the scheduler's lookahead
 * deadline (measured before the fix: 454 ms of attack-time piano renders on
 * a fully warmed 1.8 s-gate chart).
 */

const SUSTAINED_GATE_SECONDS = 1.8;

test("gate-aware prepare warms the exact bucket the attack path requests", async () => {
  const { engine } = await readyEngine();
  const first = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "concert-grand",
      notes: [
        { midiPitch: midi(48), velocity: 96, gateSeconds: SUSTAINED_GATE_SECONDS },
        { midiPitch: midi(60), velocity: 96, gateSeconds: SUSTAINED_GATE_SECONDS },
      ],
    }),
  );
  expect(first.renderedCount).toBe(2);
  expect(first.cachedCount).toBe(0);

  requireSuccess(
    engine.attackAudioVoices(
      attackRequest(
        [voice("gate-a", 48, 96), voice("gate-b", 60, 96)],
        {
          instrumentId: "concert-grand",
          eventId: "sustained-chord",
          startTimeSeconds: 0.01,
          releaseTimeSeconds: 0.01 + SUSTAINED_GATE_SECONDS,
        },
      ),
    ),
  );

  /*
   * The attack must have consumed the prepared entries: preparing the same
   * gate again reports every note cached, with nothing re-rendered.
   */
  const replay = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "concert-grand",
      notes: [
        { midiPitch: midi(48), velocity: 96, gateSeconds: SUSTAINED_GATE_SECONDS },
        { midiPitch: midi(60), velocity: 96, gateSeconds: SUSTAINED_GATE_SECONDS },
      ],
    }),
  );
  expect(replay.renderedCount).toBe(0);
  expect(replay.cachedCount).toBe(2);
});

test("a sustained gate genuinely selects a different bucket than the default", async () => {
  const { engine } = await readyEngine();
  requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "concert-grand",
      notes: [
        { midiPitch: midi(52), velocity: 88, gateSeconds: SUSTAINED_GATE_SECONDS },
      ],
    }),
  );
  /* The default preparation bucket is distinct, so it renders separately. */
  const defaultBucket = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "concert-grand",
      notes: [{ midiPitch: midi(52), velocity: 88 }],
    }),
  );
  expect(defaultBucket.renderedCount).toBe(1);
  expect(defaultBucket.cachedCount).toBe(0);

  /* A short gate that folds into the same bucket as the default is a hit. */
  const shortGate = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "concert-grand",
      notes: [{ midiPitch: midi(52), velocity: 88, gateSeconds: 1.0 }],
    }),
  );
  expect(shortGate.renderedCount).toBe(0);
  expect(shortGate.cachedCount).toBe(1);
});

test("invalid gateSeconds refuses with a named code", async () => {
  const { engine } = await readyEngine();
  /* The ceiling mirrors the attack path's MAX_AUDIO_GATE_SECONDS (600). */
  for (const gateSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 600.5]) {
    requireFailure(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [{ midiPitch: midi(48), velocity: 96, gateSeconds }],
      }),
      "audio.start_time_invalid",
    );
  }
});
