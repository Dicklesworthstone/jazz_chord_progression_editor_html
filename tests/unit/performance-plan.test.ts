/**
 * jcpe-1gao evidence: the band-sketch performance layer.
 *
 * Every structural expectation here is re-implemented from the X1 transport
 * contract's own text rather than imported from the production predicate, so
 * the layer cannot certify itself: `independentStructuralFindings` below is a
 * second, independently written copy of what `planStructurallyValid` checks.
 *
 * The rhythm expectations are measured against the reviewed starter chart
 * (Deacon Blues) published through the real T0 grammar and the real F2/F3
 * boundary, and the playability proof runs the real transport composition over
 * the deterministic fake audio platform.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

/* The playability proof renders real piano buffers; wall time is not a gate. */
setDefaultTimeout(120_000);

import { validateDocumentSemantics } from "../../src/application";
import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type {
  StudioAudioPort,
  StudioController,
} from "../../src/application/runtime";
import { STARTER_CHART } from "../../src/application/studio-starter-chart";
import {
  STUDIO_PERFORMANCE_STYLE,
  compileStudioPlaybackPlan,
  performStudioPlaybackPlan,
} from "../../src/application/studio-playback";
import {
  PROGRESSION_DOCUMENT_SCHEMA,
  decodeDocumentShape,
  makeMeter,
  type Meter,
  type ValidatedDocument,
} from "../../src/domain";
import {
  PERFORMANCE_BASS_REGISTER,
  PERFORMANCE_STYLES,
  PERFORMANCE_STYLE_IDS,
  compilePerformancePlan,
  type PlaybackPlan,
} from "../../src/playback";
import { parseChartText } from "../../src/theory";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const PLAY_GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

/** PPQ 960: one quarter-note beat, and one 4/4 bar. */
const TICKS_PER_BEAT = 960;
const TICKS_PER_BAR = 3840;

/* ------------------------------------------------------------------ */
/* An independent re-implementation of what X1 validates structurally.  */
/* ------------------------------------------------------------------ */

const AUDIO_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const MAX_AUDIO_ID_LENGTH = 128;
const MAX_EVENT_PITCHES = 16;

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Written from the X1 transport contract, not imported from `transport.ts`:
 * schema/compiler pins, ascending start ticks, positive durations, a legal
 * audio id, 1..16 MIDI pitches, and no event past the plan total.
 */
function independentStructuralFindings(plan: PlaybackPlan): readonly string[] {
  const findings: string[] = [];
  /*
   * Read the identity pins through a widened record so the checks are real
   * runtime comparisons rather than statements the compiler already knows the
   * answer to. X1 sees an untyped plan; so does this.
   */
  const identity: Readonly<Record<string, unknown>> = { ...plan };
  if (identity["schema"] !== "changes.playback.plan.v1") {
    findings.push("plan-schema");
  }
  if (identity["compilerId"] !== "changes.playback-plan-compiler") {
    findings.push("plan-compiler-id");
  }
  if (identity["compilerVersion"] !== 1) findings.push("plan-compiler-version");
  if (typeof plan.tempoBpm !== "number" || !Number.isFinite(plan.tempoBpm)) {
    findings.push("plan-tempo");
  }
  if (!isNonnegativeSafeInteger(plan.totalTicks)) findings.push("plan-total");
  if (!Array.isArray(plan.events)) findings.push("plan-events");

  let previousStartTick = -1;
  for (const event of plan.events) {
    const label = String(event.eventId);
    if (!isNonnegativeSafeInteger(event.startTick)) {
      findings.push(`start:${label}`);
    }
    if (event.startTick < previousStartTick) findings.push(`order:${label}`);
    previousStartTick = event.startTick;
    if (
      typeof event.durationTicks !== "number" ||
      !Number.isSafeInteger(event.durationTicks) ||
      event.durationTicks < 1
    ) {
      findings.push(`duration:${label}`);
    }
    if (
      typeof event.eventId !== "string" ||
      event.eventId.length === 0 ||
      event.eventId.length > MAX_AUDIO_ID_LENGTH ||
      !AUDIO_ID.test(event.eventId)
    ) {
      findings.push(`id:${label}`);
    }
    if (
      event.midiPitches.length === 0 ||
      event.midiPitches.length > MAX_EVENT_PITCHES
    ) {
      findings.push(`pitches:${label}`);
    }
    if (event.startTick + event.durationTicks > plan.totalTicks) {
      findings.push(`bounds:${label}`);
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* The reviewed Deacon Blues chart, published through T0 + F2 + F3.     */
/* ------------------------------------------------------------------ */

const AUTO_BALANCED = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

function meterOf(beatsPerBar: number, beatUnit: number): Meter {
  const made = makeMeter({ beatsPerBar, beatUnit });
  if (!made.ok) throw new Error(`PERFORMANCE_TEST_METER:${String(beatsPerBar)}`);
  return made.value;
}

/**
 * A written bar shorter than the meter's capacity. Every bar line after such a
 * bar sits off the meter's own tick grid, so `startTick / barTicks` stops
 * naming the bar the chord is written in.
 */
type ShortenedBar = Readonly<{ measureIndex: number; beats: number }>;

/**
 * Publish a chart written in the real T0 grammar as a validated document with
 * the exact Auto voicing policy the studio's quick-entry path assigns.
 */
function publishChart(
  chartText: string,
  meter: Meter,
  documentId: string,
  shortenedBar: ShortenedBar | null = null,
): ValidatedDocument {
  const parsed = parseChartText(chartText, { mode: "fragment", meter }, "ascii");
  if (!parsed.ok) {
    throw new Error(
      `PERFORMANCE_TEST_T0:${parsed.diagnostics.map(({ code }) => code).join(",")}`,
    );
  }
  let eventOrdinal = 0;
  const candidate = {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: documentId,
    title: STARTER_CHART.title,
    description: "",
    meter: { beatsPerBar: meter.beatsPerBar, beatUnit: meter.beatUnit },
    tempoBpm: 120,
    key: null,
    sections: parsed.draft.sections.map((section, sectionIndex) => ({
      id: `section-performance-${String(sectionIndex)}`,
      name: "A",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: section.measures.map((measure, measureIndex) => {
        const shortened =
          shortenedBar !== null && shortenedBar.measureIndex === measureIndex
            ? shortenedBar
            : null;
        return {
          id: `measure-performance-${String(measureIndex)}`,
          events: measure.events.map((event) => {
            eventOrdinal += 1;
            return {
              id: `event-performance-${String(eventOrdinal)}`,
              chord: event.chord,
              voicing: AUTO_BALANCED,
              duration:
                shortened === null
                  ? {
                      numerator: event.duration.numerator,
                      denominator: event.duration.denominator,
                    }
                  : { numerator: shortened.beats, denominator: 1 },
              annotation: "",
            };
          }),
          completion:
            shortened === null
              ? { kind: "complete" }
              : {
                  kind: "incomplete",
                  expectedDuration: {
                    numerator: shortened.beats,
                    denominator: 1,
                  },
                  reason: "A deliberately short written bar.",
                },
        };
      }),
    })),
    playback: {
      instrumentId: "concert-grand",
      masterVolume: 0.9,
      reverbAmount: 0.3,
      countInBars: 0,
    },
  };
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) {
    throw new Error(`PERFORMANCE_TEST_F2:${decoded.errors[0].code}`);
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(`PERFORMANCE_TEST_F3:${published.errors[0].code}`);
  }
  return published.value;
}

function literalPlanOf(document: ValidatedDocument): PlaybackPlan {
  const compiled = compileStudioPlaybackPlan(document);
  if (!compiled.ok) {
    throw new Error(`PERFORMANCE_TEST_P0:${compiled.refusal.code}`);
  }
  return compiled.plan;
}

function deaconBluesLiteralPlan(): PlaybackPlan {
  return literalPlanOf(
    publishChart(
      STARTER_CHART.chartText,
      meterOf(4, 4),
      "document-performance-deacon-blues",
    ),
  );
}

function performed(plan: PlaybackPlan): PlaybackPlan {
  const result = compilePerformancePlan({
    plan,
    styleId: STUDIO_PERFORMANCE_STYLE,
  });
  if (!result.ok) {
    throw new Error(`PERFORMANCE_TEST_COMPILE:${result.refusal.code}`);
  }
  return result.plan;
}

type EmittedRole = "bass" | "comp";

function roleOf(eventId: string): EmittedRole | null {
  const dot = eventId.lastIndexOf(".");
  if (dot < 0) return null;
  const suffix = eventId.slice(dot + 1, dot + 2);
  if (suffix === "b") return "bass";
  if (suffix === "c") return "comp";
  return null;
}

function sourceIdOf(eventId: string): string {
  const dot = eventId.lastIndexOf(".");
  return dot < 0 ? eventId : eventId.slice(0, dot);
}

/* ------------------------------------------------------------------ */

describe("the band-sketch performance compiler", () => {
  test("is deterministic: the same plan and style compile to equal events", () => {
    const literal = deaconBluesLiteralPlan();
    const first = performed(literal);
    const second = performed(literal);
    expect(first).not.toBe(second);
    expect(first.events).toEqual(second.events);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test("every emitted event satisfies X1's structural laws, re-proved here", () => {
    const literal = deaconBluesLiteralPlan();
    /* The control: the literal P0 plan itself passes the same predicate. */
    expect(independentStructuralFindings(literal)).toEqual([]);
    expect(independentStructuralFindings(performed(literal))).toEqual([]);
  });

  test("the predicate is a real gate, not a tautology", () => {
    const literal = deaconBluesLiteralPlan();
    const [first, second] = literal.events;
    if (first === undefined || second === undefined) {
      throw new Error("PERFORMANCE_TEST_CONTROL");
    }
    const outOfOrder: PlaybackPlan = Object.freeze({
      ...literal,
      events: Object.freeze([second, first]),
    });
    expect(independentStructuralFindings(outOfOrder)).not.toEqual([]);
  });

  test("every bass event sounds one pitch in 33..52 that the chord contains", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    const sourceClasses = new Map<string, ReadonlySet<number>>();
    for (const event of literal.events) {
      sourceClasses.set(
        event.eventId,
        new Set(event.midiPitches.map((midi) => ((midi % 12) + 12) % 12)),
      );
    }
    let bassEvents = 0;
    for (const event of performance.events) {
      if (roleOf(event.eventId) !== "bass") continue;
      bassEvents += 1;
      expect(event.midiPitches.length).toBe(1);
      const midi: number = event.midiPitches[0];
      expect(midi).toBeGreaterThanOrEqual(PERFORMANCE_BASS_REGISTER.lowMidi);
      expect(midi).toBeLessThanOrEqual(PERFORMANCE_BASS_REGISTER.highMidi);
      const classes = sourceClasses.get(sourceIdOf(event.eventId));
      if (classes === undefined) {
        throw new Error(`PERFORMANCE_TEST_SOURCE:${event.eventId}`);
      }
      expect(classes.has(((midi % 12) + 12) % 12)).toBe(true);
    }
    expect(bassEvents).toBe(12);
  });

  test("bass motion is stepwise rather than a sequence of octave leaps", () => {
    const performance = performed(deaconBluesLiteralPlan());
    const bassLine: readonly number[] = performance.events
      .filter((event) => roleOf(event.eventId) === "bass")
      .map((event) => event.midiPitches[0]);
    let widest = 0;
    for (let index = 1; index < bassLine.length; index += 1) {
      const previous = bassLine[index - 1] ?? 0;
      const current = bassLine[index] ?? 0;
      widest = Math.max(widest, Math.abs(current - previous));
    }
    /* The register spans 20 semitones; a leaping line would exceed a fifth. */
    expect(widest).toBeLessThanOrEqual(7);
  });

  test("no two events of the same role overlap, and none crosses the total", () => {
    const performance = performed(deaconBluesLiteralPlan());
    for (const role of ["bass", "comp"] as const) {
      const inRole = performance.events.filter(
        (event) => roleOf(event.eventId) === role,
      );
      expect(inRole.length).toBeGreaterThan(0);
      for (let index = 1; index < inRole.length; index += 1) {
        const previous = inRole[index - 1];
        const current = inRole[index];
        if (previous === undefined || current === undefined) {
          throw new Error("PERFORMANCE_TEST_ROLE");
        }
        expect(previous.startTick + previous.durationTicks).toBeLessThanOrEqual(
          current.startTick,
        );
      }
    }
    for (const event of performance.events) {
      expect(event.startTick + event.durationTicks).toBeLessThanOrEqual(
        performance.totalTicks,
      );
      expect(event.gateDurationTicks).toBeGreaterThan(0);
      expect(event.gateDurationTicks).toBeLessThanOrEqual(event.durationTicks);
      expect(event.velocity).toBeGreaterThanOrEqual(1);
      expect(event.velocity).toBeLessThanOrEqual(127);
    }
    expect(
      new Set(performance.events.map((event) => event.eventId)).size,
    ).toBe(performance.events.length);
  });

  test("block-chords@1 is the identity: the input plan is returned unchanged", () => {
    const literal = deaconBluesLiteralPlan();
    const result = compilePerformancePlan({
      plan: literal,
      styleId: "block-chords@1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("PERFORMANCE_TEST_IDENTITY");
    expect(result.plan).toBe(literal);
    expect(JSON.stringify(result.plan)).toBe(JSON.stringify(literal));
    expect(result.evidence.termination).toBe("identity");
  });

  test("the plan carries P0's identity so downstream cannot tell it apart", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    expect(performance.schema).toBe(literal.schema);
    expect(performance.compilerId).toBe(literal.compilerId);
    expect(performance.compilerVersion).toBe(literal.compilerVersion);
    expect(performance.sourceDocumentId).toBe(literal.sourceDocumentId);
    expect(performance.tempoBpm).toBe(literal.tempoBpm);
    expect(performance.meter).toEqual(literal.meter);
    expect(performance.totalBeats).toEqual(literal.totalBeats);
    expect(performance.totalTicks).toBe(literal.totalTicks);
    expect(performance.midiPpq).toBe(literal.midiPpq);
    expect(Object.keys(performance)).toEqual(Object.keys(literal));
    for (const event of performance.events) {
      expect(Object.keys(event)).toEqual(Object.keys(literal.events[0] ?? {}));
    }
  });

  test("every declared style is frozen, tick-integral and in-bar", () => {
    for (const styleId of PERFORMANCE_STYLE_IDS) {
      const style = PERFORMANCE_STYLES[styleId];
      expect(style.id).toBe(styleId);
      expect(Object.isFrozen(style)).toBe(true);
      const slots = [...style.bassSlots, ...style.compSlots];
      for (const slot of slots) {
        const offset = slot.offsetBeats;
        const duration = slot.durationBeats;
        expect((offset.numerator * TICKS_PER_BEAT) % offset.denominator).toBe(0);
        expect(
          (duration.numerator * TICKS_PER_BEAT) % duration.denominator,
        ).toBe(0);
        const offsetTicks =
          (offset.numerator * TICKS_PER_BEAT) / offset.denominator;
        expect(offsetTicks).toBeGreaterThanOrEqual(0);
        expect(offsetTicks).toBeLessThan(TICKS_PER_BAR);
        /*
         * X0 refuses a non-integer velocity and that refusal FAULTS the
         * transport, where a performance-layer refusal only costs the sketch.
         * The table is the only source of an emitted velocity, so integrality
         * is asserted here rather than left to the emitter to discover.
         */
        expect(Number.isInteger(slot.velocity)).toBe(true);
        expect(slot.velocity).toBeGreaterThanOrEqual(1);
        expect(slot.velocity).toBeLessThanOrEqual(127);
      }
    }
  });

  test("slots are placed from each written bar, not from the meter tick grid", () => {
    /*
     * The middle bar is written as three beats, so the third bar line lands at
     * tick 6720 while `startTick / barTicks` still says a bar begins at 7680.
     * Reading the grid instead of the chart put the bar's heaviest bass note
     * one beat inside every following bar, for the whole rest of the chart.
     */
    const literal = literalPlanOf(
      publishChart(
        "| Cmaj7 | Dm7 | G7 |",
        meterOf(4, 4),
        "document-performance-short-bar",
        Object.freeze({ measureIndex: 1, beats: 3 }),
      ),
    );
    expect(literal.events.map((event) => Number(event.startTick))).toEqual([
      0, 3840, 6720,
    ]);

    const style = PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE];
    const offsetTicks = (
      offset: Readonly<{ numerator: number; denominator: number }>,
    ): number => (offset.numerator * TICKS_PER_BEAT) / offset.denominator;
    const bassOffsets = new Set(
      style.bassSlots.map((slot) => offsetTicks(slot.offsetBeats)),
    );
    const compOffsets = new Set(
      style.compSlots.map((slot) => offsetTicks(slot.offsetBeats)),
    );

    const barStarts = new Map<string, number>();
    const chordStarts = new Map<string, number>();
    const chordBars = new Map<string, string>();
    for (const event of literal.events) {
      if (!barStarts.has(event.measureId)) {
        barStarts.set(event.measureId, event.startTick);
      }
      chordStarts.set(event.eventId, event.startTick);
      chordBars.set(event.eventId, event.measureId);
    }

    const misplaced: string[] = [];
    for (const event of performed(literal).events) {
      const sourceId = sourceIdOf(event.eventId);
      const measureId = chordBars.get(sourceId);
      const barStart =
        measureId === undefined ? undefined : barStarts.get(measureId);
      if (barStart === undefined) {
        throw new Error(`PERFORMANCE_TEST_BAR:${event.eventId}`);
      }
      const role = roleOf(event.eventId);
      const declared = role === "bass" ? bassOffsets : compOffsets;
      /* A bass also always sounds at its own chord's arrival. */
      const arrival =
        role === "bass" && event.startTick === chordStarts.get(sourceId);
      if (!declared.has(event.startTick - barStart) && !arrival) {
        misplaced.push(
          `${event.eventId}@+${String(event.startTick - barStart)}`,
        );
      }
    }
    expect(misplaced).toEqual([]);
  });

  test("an unsupported meter refuses honestly and the studio keeps the chart", () => {
    const waltz = publishChart(
      "| Cmaj7 | Fmaj7 |",
      meterOf(3, 4),
      "document-performance-waltz",
    );
    const literal = literalPlanOf(waltz);
    const result = compilePerformancePlan({
      plan: literal,
      styleId: "ballad-comp@1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("PERFORMANCE_TEST_METER_REFUSAL");
    expect(result.refusal.code).toBe("performance.meter_unsupported");
    expect(result.refusal.styleId).toBe("ballad-comp@1");
    /* The silent, deterministic fallback: playback keeps the literal plan. */
    expect(performStudioPlaybackPlan(literal)).toBe(literal);
  });
});

describe("the seeded Deacon Blues chart as a performance", () => {
  test("has strictly more events, real syncopation, and bass in every bar", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);

    expect(literal.events.length).toBe(10);
    expect(performance.events.length).toBe(24);
    expect(performance.events.length).toBeGreaterThan(literal.events.length);

    const offBeat = performance.events.filter(
      (event) => event.startTick % TICKS_PER_BEAT !== 0,
    );
    expect(offBeat.length).toBe(6);
    /* The literal chart is entirely on the beat; the performance is not. */
    expect(
      literal.events.filter((event) => event.startTick % TICKS_PER_BEAT !== 0)
        .length,
    ).toBe(0);

    const barCount = performance.totalTicks / TICKS_PER_BAR;
    expect(barCount).toBe(6);
    for (let bar = 0; bar < barCount; bar += 1) {
      const start = bar * TICKS_PER_BAR;
      const inBar = performance.events.filter(
        (event) =>
          roleOf(event.eventId) === "bass" &&
          event.startTick >= start &&
          event.startTick < start + TICKS_PER_BAR,
      );
      expect(
        inBar.every((event) =>
          event.midiPitches.every(
            (midi) =>
              midi >= PERFORMANCE_BASS_REGISTER.lowMidi &&
              midi <= PERFORMANCE_BASS_REGISTER.highMidi,
          ),
        ),
      ).toBe(true);
      expect(`bar ${String(bar + 1)}: ${String(inBar.length)}`).toBe(
        `bar ${String(bar + 1)}: 2`,
      );
    }

    /* Every bar of the chart also gets at least one comp stab. */
    for (let bar = 0; bar < barCount; bar += 1) {
      const start = bar * TICKS_PER_BAR;
      const comps = performance.events.filter(
        (event) =>
          roleOf(event.eventId) === "comp" &&
          event.startTick >= start &&
          event.startTick < start + TICKS_PER_BAR,
      );
      expect(comps.length).toBeGreaterThan(0);
    }
  });

  test("the two-chords-per-bar case gives each chord its own root bass", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    /* Bar 1 holds Cmaj7 then Bm7#5; both must be announced in the bass. */
    const firstBar = performance.events.filter(
      (event) =>
        roleOf(event.eventId) === "bass" && event.startTick < TICKS_PER_BAR,
    );
    expect(firstBar.length).toBe(2);
    expect(firstBar.map((event) => Number(event.startTick))).toEqual([0, 1920]);
    expect(
      firstBar.map((event) => ((event.midiPitches[0] % 12) + 12) % 12),
    ).toEqual([0, 11]);
  });
});

/* ------------------------------------------------------------------ */
/* End to end: the seeded chart still plays through the real transport. */
/* ------------------------------------------------------------------ */

type CapturingAudio = Readonly<{
  port: StudioAudioPort;
  played: readonly PlaybackPlan[];
}>;

function capturingAudio(): CapturingAudio {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const played: PlaybackPlan[] = [];
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    play: (...args: Parameters<StudioAudioPort["play"]>) => {
      const binding = args[1];
      played.push(binding.plan);
      return inner.play(...args);
    },
  });
  return Object.freeze({ port, played });
}

function audibleController(audio: StudioAudioPort): StudioController {
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`PERFORMANCE_TEST_CONTROLLER:${creation.refusal.code}`);
  }
  return creation.controller;
}

describe("the wired studio", () => {
  test("plays the seeded chart as the performance through the real transport", async () => {
    const audio = capturingAudio();
    const controller = audibleController(audio.port);
    expect(seedStarterChart(controller).seeded).toBe(true);

    const result = controller.playProgression(PLAY_GESTURE);
    expect(result.ok ? "plays" : result.refusal.message).toBe("plays");

    /*
     * The port is driven from an async continuation that initializes the
     * graph and pre-renders the run's note buffers first. Poll for the
     * handoff with a bounded number of turns; the bound is a test-harness
     * guard against hanging, never a musical cutoff.
     */
    for (let turn = 0; turn < 600 && audio.played.length === 0; turn += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    }

    expect(audio.played.length).toBeGreaterThan(0);
    const scheduled = audio.played[audio.played.length - 1];
    if (scheduled === undefined) throw new Error("PERFORMANCE_TEST_NO_PLAN");
    expect(independentStructuralFindings(scheduled)).toEqual([]);
    /* The transport received the performance, not the ten written pads. */
    expect(scheduled.events.length).toBe(24);
    expect(
      scheduled.events.some(
        (event) => event.startTick % TICKS_PER_BEAT !== 0,
      ),
    ).toBe(true);
    expect(
      scheduled.events.some((event) => roleOf(event.eventId) === "bass"),
    ).toBe(true);

    expect(controller.stopProgression().ok).toBe(true);
  });

  test("the seeded chart PLAYS over the plain fake platform as before", () => {
    const controller = audibleController(
      createStudioAudio(createFakeAudioPlatform().platform),
    );
    expect(seedStarterChart(controller).seeded).toBe(true);
    const played = controller.playProgression(PLAY_GESTURE);
    expect(played.ok ? "plays" : played.refusal.message).toBe("plays");
    expect(controller.stopProgression().ok).toBe(true);
  });

  test("the studio's style constant names a declared, reviewed style", () => {
    expect(PERFORMANCE_STYLE_IDS).toContain(STUDIO_PERFORMANCE_STYLE);
    expect(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE].kind).toBe(
      "band-sketch",
    );
  });
});
