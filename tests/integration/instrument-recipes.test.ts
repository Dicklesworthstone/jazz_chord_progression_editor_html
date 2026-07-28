import { describe, expect, test } from "bun:test";

import { AUDIO_INSTRUMENT_RECIPES } from "../../src/audio";
import type { InstrumentId } from "../../src/domain";
import recipeFixture from "../fixtures/audio-engine/instrument-recipes.json";
import type { FakeAudioEvent } from "../../src/test-support/fake-audio-platform";
import {
  attackRequest,
  readyEngine,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

const RECIPE_CASES: readonly Readonly<{
  caseId: string;
  instrumentId: InstrumentId;
  label: string;
  outputLevel: number;
  polyphonyLimit: number;
  scheduledSourceCount: number;
  attackSeconds: number;
  releaseSeconds: number;
}>[] = [
  {
    caseId: "X0-RENDER-001",
    instrumentId: "mellow-keys",
    label: "Mellow Keys",
    outputLevel: 0.62,
    polyphonyLimit: 64,
    scheduledSourceCount: 3,
    attackSeconds: 0.008,
    releaseSeconds: 0.55,
  },
  {
    caseId: "X0-RENDER-004",
    instrumentId: "fm-electric-piano",
    label: "FM Electric Piano",
    outputLevel: 0.48,
    polyphonyLimit: 48,
    scheduledSourceCount: 2,
    attackSeconds: 0.003,
    releaseSeconds: 0.9,
  },
  {
    caseId: "X0-RENDER-007",
    instrumentId: "vibraphone",
    label: "Vibraphone",
    outputLevel: 0.5,
    polyphonyLimit: 48,
    scheduledSourceCount: 4,
    attackSeconds: 0.002,
    releaseSeconds: 1.1,
  },
  {
    caseId: "X0-RENDER-010",
    instrumentId: "warm-pad",
    label: "Warm Pad",
    outputLevel: 0.3,
    polyphonyLimit: 32,
    scheduledSourceCount: 3,
    attackSeconds: 0.32,
    releaseSeconds: 1.8,
  },
  {
    caseId: "X0-RENDER-013",
    instrumentId: "analog-poly",
    label: "Analog Poly",
    outputLevel: 0.34,
    polyphonyLimit: 48,
    scheduledSourceCount: 3,
    attackSeconds: 0.012,
    releaseSeconds: 0.65,
  },
  {
    caseId: "X0-RENDER-016",
    instrumentId: "concert-grand",
    label: "Concert Grand",
    outputLevel: 0.85,
    polyphonyLimit: 64,
    scheduledSourceCount: 1,
    attackSeconds: 0.002,
    releaseSeconds: 0.2,
  },
];

function oneEvent(
  events: readonly FakeAudioEvent[],
  label: string,
  predicate: (event: FakeAudioEvent) => boolean,
): FakeAudioEvent {
  const matches = events.filter(predicate);
  expect(matches, label).toHaveLength(1);
  const event = matches[0];
  if (event === undefined) throw new Error(`TEST_EVENT_MISSING: ${label}`);
  return event;
}

function paramSchedule(
  events: readonly FakeAudioEvent[],
  subject: string,
): readonly Readonly<{
  detail: string;
  value: number | string | null;
  atTimeSeconds: number | null;
}>[] {
  return events
    .filter((event) => event.kind === "param-event" && event.subject === subject)
    .map(({ detail, value, atTimeSeconds }) => ({
      detail,
      value,
      atTimeSeconds,
    }));
}

function expectExactFixtureValue(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectOscillatorComponent(
  events: readonly FakeAudioEvent[],
  oscillatorId: string,
  component: Readonly<{
    waveform: string;
    frequencyRatio: number;
    detuneCents: number;
    level: number;
  }>,
  baseFrequencyHz: number,
): void {
  if (component.waveform === "periodic-pulse-25") {
    oneEvent(
      events,
      `${oscillatorId} periodic wave`,
      (event) =>
        event.kind === "node-setting" &&
        event.subject === oscillatorId &&
        event.detail === "periodic-wave",
    );
  } else {
    expect(
      oneEvent(
        events,
        `${oscillatorId} waveform`,
        (event) =>
          event.kind === "node-setting" &&
          event.subject === oscillatorId &&
          event.detail === "type",
      ).value,
    ).toBe(component.waveform);
  }
  expect(paramSchedule(events, `${oscillatorId}.frequency`)).toEqual([
    {
      detail: "set",
      value: baseFrequencyHz * component.frequencyRatio,
      atTimeSeconds: 0,
    },
  ]);
  expect(paramSchedule(events, `${oscillatorId}.detune`)).toEqual([
    { detail: "set", value: component.detuneCents, atTimeSeconds: 0 },
  ]);
  const connection = oneEvent(
    events,
    `${oscillatorId} component gain connection`,
    (event) => event.kind === "node-connect" && event.subject === oscillatorId,
  );
  expect(paramSchedule(events, `${connection.detail}.gain`)[0]).toEqual({
    detail: "set",
    value: component.level,
    atTimeSeconds: 0,
  });
}

describe("TR-X0-RECIPES instrument recipes", () => {
  test("X0-RENDER-001/X0-RENDER-004/X0-RENDER-007/X0-RENDER-010/X0-RENDER-013/X0-RENDER-016 schedules every exact source-owned recipe", async () => {
    const { engine, fake, context } = await readyEngine();
    expect(AUDIO_INSTRUMENT_RECIPES).toHaveLength(6);

    for (let index = 0; index < RECIPE_CASES.length; index += 1) {
      const expected = RECIPE_CASES[index];
      const recipe = AUDIO_INSTRUMENT_RECIPES[index];
      if (expected === undefined || recipe === undefined) {
        throw new Error("TEST_RECIPE_MATRIX_MISMATCH");
      }
      const reviewed = recipeFixture.recipes[index];
      if (reviewed === undefined) {
        throw new Error("TEST_REVIEWED_RECIPE_MATRIX_MISMATCH");
      }
      const {
        scheduledSourceCount: reviewedSourceCount,
        ...reviewedProductionRecipe
      } = reviewed;
      expectExactFixtureValue(recipe, reviewedProductionRecipe);
      expect(reviewedSourceCount).toBe(expected.scheduledSourceCount);
      expect(recipe).toMatchObject({
        id: expected.instrumentId,
        label: expected.label,
        outputLevel: expected.outputLevel,
        polyphonyLimit: expected.polyphonyLimit,
        amplitude: {
          attackSeconds: expected.attackSeconds,
          releaseSeconds: expected.releaseSeconds,
        },
      });
      expect(recipe.designClaim).not.toMatch(/sample|brand|acoustic model/i);

      const sourcesBefore = context.sourceIds().length;
      const eventOffset = fake.events.length;
      const workBefore = engine.inspectAudioEngine().work.parameterEventsScheduled;
      const attacked = requireSuccess(
        engine.attackAudioVoices(
          attackRequest([voice(`recipe-${String(index)}`, 60 + index, 100)], {
            eventId: `recipe-event-${String(index)}`,
            instrumentId: expected.instrumentId,
          }),
        ),
      );
      const active = attacked.snapshot.activeVoices.find(
        (entry) => entry.voiceId === `recipe-${String(index)}`,
      );
      expect(active?.instrumentId).toBe(expected.instrumentId);
      expect(active?.scheduledSourceCount).toBe(expected.scheduledSourceCount);
      expect(context.sourceIds().length - sourcesBefore).toBe(
        expected.scheduledSourceCount,
      );
      expect(
        attacked.snapshot.work.parameterEventsScheduled,
      ).toBeGreaterThan(workBefore);

      const events = fake.events.slice(eventOffset);
      const nodeCreates = events.filter((event) => event.kind === "node-create");
      const filterId = oneEvent(
        nodeCreates,
        `${reviewed.id} voice filter`,
        (event) => event.detail === "filter",
      ).subject;
      const amplitudeGainId = oneEvent(
        events,
        `${reviewed.id} amplitude connection`,
        (event) =>
          event.kind === "node-connect" && event.subject === filterId,
      ).detail;
      expect(
        oneEvent(
          events,
          `${reviewed.id} filter type`,
          (event) =>
            event.kind === "node-setting" &&
            event.subject === filterId &&
            event.detail === "type",
        ).value,
      ).toBe(reviewed.filter.type);
      expect(paramSchedule(events, `${filterId}.q`)).toEqual([
        { detail: "set", value: reviewed.filter.q, atTimeSeconds: 0 },
      ]);
      expect(paramSchedule(events, `${filterId}.frequency`)).toEqual([
        {
          detail: "set",
          value: reviewed.filter.attackHz,
          atTimeSeconds: 0,
        },
        {
          detail: "linear",
          value: reviewed.filter.peakHz,
          atTimeSeconds: reviewed.amplitude.attackSeconds,
        },
        {
          detail: "exponential",
          value: reviewed.filter.sustainHz,
          atTimeSeconds:
            reviewed.amplitude.attackSeconds + reviewed.filter.decaySeconds,
        },
      ]);
      const peakGain =
        reviewed.outputLevel * Math.pow(100 / 127, 1.5);
      const amplitudeSchedule = paramSchedule(
        events,
        `${amplitudeGainId}.gain`,
      );
      expect(amplitudeSchedule.slice(0, 3)).toEqual([
        { detail: "set", value: 0, atTimeSeconds: 0 },
        {
          detail: "linear",
          value: peakGain,
          atTimeSeconds: reviewed.amplitude.attackSeconds,
        },
        {
          detail: "linear",
          value: peakGain * reviewed.amplitude.sustainLevel,
          atTimeSeconds:
            reviewed.amplitude.attackSeconds + reviewed.amplitude.decaySeconds,
        },
      ]);
      expect(amplitudeSchedule.at(-1)).toEqual({
        detail: "linear",
        value: 0,
        atTimeSeconds: 1 + reviewed.amplitude.releaseSeconds,
      });

      const oscillatorIds = nodeCreates
        .filter((event) => event.detail === "oscillator")
        .map((event) => event.subject);
      const baseFrequencyHz =
        440 * Math.pow(2, (60 + index - 69) / 12);
      if (reviewed.synthesis === "additive") {
        const oscillators = reviewed.oscillators;
        const transient = reviewed.transient;
        const tremolo = reviewed.tremolo;
        if (
          oscillators === undefined ||
          transient === undefined ||
          tremolo === undefined
        ) {
          throw new Error("TEST_REVIEWED_ADDITIVE_RECIPE_MALFORMED");
        }
        for (const [componentIndex, component] of oscillators.entries()) {
          const oscillatorId = oscillatorIds[componentIndex];
          if (oscillatorId === undefined) {
            throw new Error("TEST_RECIPE_OSCILLATOR_MISSING");
          }
          expectOscillatorComponent(
            events,
            oscillatorId,
            component,
            baseFrequencyHz,
          );
        }
        let nextSourceIndex = oscillators.length;
        if (transient !== null) {
          const transientId = oscillatorIds[nextSourceIndex];
          if (transientId === undefined) {
            throw new Error("TEST_RECIPE_TRANSIENT_MISSING");
          }
          nextSourceIndex += 1;
          expect(
            oneEvent(
              events,
              `${reviewed.id} transient waveform`,
              (event) =>
                event.kind === "node-setting" &&
                event.subject === transientId &&
                event.detail === "type",
            ).value,
          ).toBe(transient.waveform);
          expect(paramSchedule(events, `${transientId}.frequency`)).toEqual([
            {
              detail: "set",
              value: baseFrequencyHz * transient.frequencyRatio,
              atTimeSeconds: 0,
            },
          ]);
          const transientGainId = oneEvent(
            events,
            `${reviewed.id} transient gain connection`,
            (event) =>
              event.kind === "node-connect" && event.subject === transientId,
          ).detail;
          expect(paramSchedule(events, `${transientGainId}.gain`)).toEqual([
            {
              detail: "set",
              value: transient.level,
              atTimeSeconds: 0,
            },
            {
              detail: "linear",
              value: 0,
              atTimeSeconds: transient.decaySeconds,
            },
          ]);
        }
        if (tremolo !== null) {
          const tremoloId = oscillatorIds[nextSourceIndex];
          if (tremoloId === undefined) {
            throw new Error("TEST_RECIPE_TREMOLO_MISSING");
          }
          expect(paramSchedule(events, `${tremoloId}.frequency`)).toEqual([
            {
              detail: "set",
              value: tremolo.rateHz,
              atTimeSeconds: 0,
            },
          ]);
          const depthGainId = oneEvent(
            events,
            `${reviewed.id} tremolo depth connection`,
            (event) =>
              event.kind === "node-connect" && event.subject === tremoloId,
          ).detail;
          const modulationConnection = oneEvent(
            events,
            `${reviewed.id} tremolo parameter connection`,
            (event) =>
              event.kind === "param-connect" && event.subject === depthGainId,
          );
          const tremoloGainId = modulationConnection.detail.replace(/\.gain$/u, "");
          const depthStart = tremolo.delaySeconds;
          const depthEnd = depthStart + 0.01;
          expect(paramSchedule(events, `${depthGainId}.gain`)).toEqual([
            { detail: "set", value: 0, atTimeSeconds: 0 },
            { detail: "set", value: 0, atTimeSeconds: depthStart },
            {
              detail: "linear",
              value: tremolo.depth / 2,
              atTimeSeconds: depthEnd,
            },
          ]);
          expect(paramSchedule(events, `${tremoloGainId}.gain`)).toEqual([
            { detail: "set", value: 1, atTimeSeconds: 0 },
            { detail: "set", value: 1, atTimeSeconds: depthStart },
            {
              detail: "linear",
              value: 1 - tremolo.depth / 2,
              atTimeSeconds: depthEnd,
            },
          ]);
        }
      } else if (reviewed.synthesis === "fm-pair") {
        const carrier = reviewed.carrier;
        const modulator = reviewed.modulator;
        if (carrier === undefined || modulator === undefined) {
          throw new Error("TEST_REVIEWED_FM_RECIPE_MALFORMED");
        }
        const carrierId = oscillatorIds[0];
        const modulatorId = oscillatorIds[1];
        if (carrierId === undefined || modulatorId === undefined) {
          throw new Error("TEST_RECIPE_FM_SOURCE_MISSING");
        }
        expectOscillatorComponent(
          events,
          carrierId,
          carrier,
          baseFrequencyHz,
        );
        expect(
          oneEvent(
            events,
            `${reviewed.id} modulator waveform`,
            (event) =>
              event.kind === "node-setting" &&
              event.subject === modulatorId &&
              event.detail === "type",
          ).value,
        ).toBe(modulator.waveform);
        const modulatorFrequency =
          baseFrequencyHz * modulator.frequencyRatio;
        expect(paramSchedule(events, `${modulatorId}.frequency`)).toEqual([
          { detail: "set", value: modulatorFrequency, atTimeSeconds: 0 },
        ]);
        expect(paramSchedule(events, `${modulatorId}.detune`)).toEqual([
          {
            detail: "set",
            value: modulator.detuneCents,
            atTimeSeconds: 0,
          },
        ]);
        const modulationGainId = oneEvent(
          events,
          `${reviewed.id} FM modulation connection`,
          (event) =>
            event.kind === "node-connect" &&
            event.subject === modulatorId &&
            events.some(
              (candidate) =>
                candidate.kind === "param-connect" &&
                candidate.subject === event.detail &&
                candidate.detail === `${carrierId}.frequency`,
            ),
        ).detail;
        const velocityProgress = (100 - 1) / 126;
        const indexScale =
          modulator.velocityIndexScaleMinimum +
          (modulator.velocityIndexScaleMaximum -
            modulator.velocityIndexScaleMinimum) *
            velocityProgress;
        expect(paramSchedule(events, `${modulationGainId}.gain`)).toEqual([
          {
            detail: "set",
            value:
              modulatorFrequency * modulator.peakIndex * indexScale,
            atTimeSeconds: 0,
          },
          {
            detail: "exponential",
            value:
              modulatorFrequency *
              modulator.sustainIndex *
              indexScale,
            atTimeSeconds: modulator.decaySeconds,
          },
        ]);
        const lifecycleGainId = oneEvent(
          events,
          `${reviewed.id} FM lifecycle connection`,
          (event) =>
            event.kind === "node-connect" &&
            event.subject === modulatorId &&
            event.detail !== modulationGainId,
        ).detail;
        expect(paramSchedule(events, `${lifecycleGainId}.gain`)).toEqual([
          { detail: "set", value: 0, atTimeSeconds: 0 },
        ]);
        expect(
          oneEvent(
            events,
            `${reviewed.id} silent FM lifecycle route`,
            (event) =>
              event.kind === "node-connect" &&
              event.subject === lifecycleGainId,
          ).detail,
        ).toBe(filterId);
      } else if (reviewed.synthesis === "rendered") {
        const renderer = reviewed.renderer;
        if (renderer === undefined) {
          throw new Error("TEST_REVIEWED_RENDERED_RECIPE_MALFORMED");
        }
        expect(renderer).toEqual({
          algorithmId: "changes.dsp.concert-grand@1",
          channels: 2,
          maximumRenderSeconds: 8,
          bufferCacheLimit: 96,
        });
        expect(oscillatorIds).toHaveLength(0);
        const bufferSourceIds = nodeCreates
          .filter((event) => event.detail === "buffer-source")
          .map((event) => event.subject);
        expect(bufferSourceIds).toHaveLength(1);
        const bufferSourceId = bufferSourceIds[0];
        if (bufferSourceId === undefined) {
          throw new Error("TEST_RECIPE_BUFFER_SOURCE_MISSING");
        }
        expect(
          oneEvent(
            events,
            `${reviewed.id} rendered source filter connection`,
            (event) =>
              event.kind === "node-connect" &&
              event.subject === bufferSourceId,
          ).detail,
        ).toBe(filterId);
      } else {
        throw new Error("TEST_REVIEWED_RECIPE_SYNTHESIS_UNKNOWN");
      }
    }

    expect(
      fake.events.some((event) => event.kind === "param-connect"),
    ).toBe(true);
    expect(
      fake.events.some(
        (event) =>
          event.kind === "node-setting" && event.detail === "periodic-wave",
      ),
    ).toBe(true);
    expect(RECIPE_CASES.map((entry) => entry.caseId)).toEqual([
      "X0-RENDER-001",
      "X0-RENDER-004",
      "X0-RENDER-007",
      "X0-RENDER-010",
      "X0-RENDER-013",
      "X0-RENDER-016",
    ]);
  });
});
