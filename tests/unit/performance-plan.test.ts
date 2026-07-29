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
  PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES,
  PERFORMANCE_COMP_MAX_SPAN_SEMITONES,
  PERFORMANCE_COMP_MIN_WIDTH_VOICES,
  PERFORMANCE_COMP_REGISTER_POLICY_VERSION,
  PERFORMANCE_STYLES,
  PERFORMANCE_STYLE_IDS,
  compilePerformancePlan,
  type PerformanceCompRegister,
  type PerformanceCompVoicing,
  type PerformanceStyle,
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

/**
 * The swing law, written here from the contract's own sentence rather than
 * imported: an offset exactly halfway through its beat moves to
 * `beatStart + round(beatTicks * swingRatio)`; every other offset is left
 * alone. The compiler must agree with this, not the other way round.
 */
function independentlySwung(offsetTicks: number, style: PerformanceStyle): number {
  const within = offsetTicks % TICKS_PER_BEAT;
  if (within * 2 !== TICKS_PER_BEAT) return offsetTicks;
  const ratio = style.swingRatio;
  return (
    offsetTicks
    - within
    + Math.round((TICKS_PER_BEAT * ratio.numerator) / ratio.denominator)
  );
}

function declaredOffsetTicks(
  offset: Readonly<{ numerator: number; denominator: number }>,
): number {
  return (offset.numerator * TICKS_PER_BEAT) / offset.denominator;
}

/**
 * The written measure index of every bar, taken from the literal plan the way
 * the compiler takes it: P0 emits in document order, so a change of
 * `measureId` is where the next written bar begins. It is the bar-cycle phase
 * source, and this test re-derives it rather than importing it.
 */
function writtenMeasureIndices(plan: PlaybackPlan): ReadonlyMap<string, number> {
  const indices = new Map<string, number>();
  for (const event of plan.events) {
    if (!indices.has(event.measureId)) indices.set(event.measureId, indices.size);
  }
  return indices;
}

/**
 * The comp slot a style states a chord's arrival with: the first slot the
 * style declares for the phase the chord's own bar sits in. Written here from
 * the contract's sentence, not imported.
 */
function arrivalCompVoicing(
  style: PerformanceStyle,
  measureIndex: number,
): PerformanceCompVoicing | null {
  const phase =
    style.barCycleLength <= 1 ? 0 : measureIndex % style.barCycleLength;
  for (const slot of style.compSlots) {
    if (slot.cyclePhases.includes(phase)) return slot.voicing;
  }
  return null;
}

/**
 * The voices a comp sounds, re-implemented from the contract: `all` keeps the
 * written voicing, `upper-voices` drops the lowest voice of a four-or-more
 * voice chord because a bass slot is already sounding that pitch class.
 */
function compVoicesOf(
  midiPitches: readonly number[],
  voicing: PerformanceCompVoicing,
): readonly number[] {
  const ascending = [...midiPitches].sort((left, right) => left - right);
  if (voicing === "all" || ascending.length < 4) return ascending;
  return ascending.slice(1);
}

/* ------------------------------------------------------------------ */
/* The comp register law, re-implemented from the contract's sentences. */
/* ------------------------------------------------------------------ */

/**
 * The three frozen numbers, written here as literals rather than imported, so
 * this file states the law instead of restating whatever the source happens to
 * say. `the register policy publishes exactly the numbers this file assumes`
 * below asserts the exports agree with them; if the production constants ever
 * drift, that test fails rather than this one silently following along.
 */
const SEPARATION_SEMITONES = 13;
const MAX_COMP_SPAN_SEMITONES = 19;
const MIN_COMP_WIDTH_VOICES = 3;

/**
 * `placeCompInRegister`, re-derived from the contract text:
 *
 *  1. WIDTH — while the voicing spans more than a nineteenth and has more than
 *     three voices, drop its lowest voice.
 *  2. REGISTER — octave-transpose the whole voicing so its lowest voice lands
 *     in the home octave `[lowMidi, lowMidi + 11]`; twelve consecutive
 *     semitones, so exactly one placement qualifies.
 *  3. SEPARATION and CEILING — accept that placement when its bottom clears the
 *     sounding bass by a minor ninth and its top is at or under `ceilingMidi`;
 *     otherwise try the same voicing ONE octave higher; otherwise drop the
 *     lowest voice and start the search again.
 *
 * Deliberately written with plain floating `Math.ceil` and array slicing — a
 * second, differently shaped implementation of the same arithmetic the
 * compiler does with integer floor division.
 */
function independentlyPlacedComp(
  voices: readonly number[],
  bassMidi: number | null,
  register: PerformanceCompRegister,
): readonly number[] {
  let work = [...voices].sort((left, right) => left - right);
  const spanOf = (notes: readonly number[]): number =>
    (notes[notes.length - 1] ?? 0) - (notes[0] ?? 0);
  while (
    work.length > MIN_COMP_WIDTH_VOICES &&
    spanOf(work) > MAX_COMP_SPAN_SEMITONES
  ) {
    work = work.slice(1);
  }
  const floor =
    bassMidi === null
      ? register.lowMidi
      : Math.max(register.lowMidi, bassMidi + SEPARATION_SEMITONES);
  for (let guard = 0; guard <= voices.length; guard += 1) {
    const low = work[0] ?? 0;
    const high = work[work.length - 1] ?? 0;
    const home = Math.ceil((register.lowMidi - low) / 12);
    for (const shift of [home, home + 1]) {
      if (low + 12 * shift < floor) continue;
      if (high + 12 * shift > register.ceilingMidi) continue;
      return work.map((midi) => midi + 12 * shift);
    }
    if (work.length <= 1) {
      return work.map((midi) => midi + 12 * (home + 1));
    }
    work = work.slice(1);
  }
  throw new Error("REGISTER_TEST_PLACEMENT_DID_NOT_TERMINATE");
}

/** The comping register a style declares; a band sketch must declare one. */
function registerOf(style: PerformanceStyle): PerformanceCompRegister {
  const register = style.compRegister;
  if (register === null) throw new Error(`REGISTER_TEST_NULL:${style.id}`);
  return register;
}

/**
 * The bass note sounding under a tick: the most recent bass ATTACK at or
 * before it. Null when nothing has attacked yet.
 */
function bassSoundingAt(plan: PlaybackPlan, tick: number): number | null {
  let sounding: number | null = null;
  for (const event of plan.events) {
    if (Number(event.startTick) > tick) break;
    if (roleOf(event.eventId) !== "bass") continue;
    sounding = Number(event.midiPitches[0]);
  }
  return sounding;
}

/**
 * How many voices were dropped from the bottom, and by how many octaves the
 * rest moved — or null when the emitted notes are NOT an octave transposition
 * of a contiguous TOP SLICE of the source voicing.
 *
 * This is the structural statement of "normalization transposes, it never
 * re-voices": it proves in one predicate that no pitch was invented, none was
 * reordered, none was respelled into a different interval, every surviving
 * interval is the written one, and every surviving pitch class is a pitch
 * class the written chord sounds. It reads only the two note arrays, so it
 * borrows nothing from the compiler's own reasoning.
 */
function octaveTransposedTopSliceOf(
  source: readonly number[],
  comp: readonly number[],
): Readonly<{ dropped: number; octaves: number }> | null {
  const ascending = [...source].sort((left, right) => left - right);
  const dropped = ascending.length - comp.length;
  if (dropped < 0) return null;
  const slice = ascending.slice(dropped);
  const first = slice[0];
  const head = comp[0];
  if (first === undefined || head === undefined) return null;
  const shift = head - first;
  if (shift % 12 !== 0) return null;
  for (let index = 0; index < slice.length; index += 1) {
    if ((comp[index] ?? NaN) - (slice[index] ?? NaN) !== shift) return null;
  }
  return Object.freeze({ dropped, octaves: shift / 12 });
}

/**
 * The START TICKS medium-swing@1 emitted BEFORE the arrival law existed, in
 * emission order. The style is the negative control on every lever the ballad
 * overhaul introduced: it declares the straight 1/2 ratio and a one-bar cycle,
 * so swing may never displace one of these ticks and the bar cycle may never
 * silence one. The arrival law is the single thing that legitimately changes
 * this style's output, and it changes it by ADDING — never by moving.
 *
 * Ticks rather than whole events on purpose: the arrival law renumbers the
 * comp ordinals inside each chord (the old `c0` becomes `c1`), so an
 * event-for-event pin would fail for a reason that has nothing to do with
 * where anything is played.
 */
const MEDIUM_SWING_TICKS_BEFORE_THE_ARRIVAL_LAW: readonly number[] =
  Object.freeze([
    0, 960, 1440,
    1920, 2880, 3360,
    3840, 4800, 5280,
    5760, 6720, 7200,
    7680, 8640, 9120,
    9600, 10560, 11040,
    11520, 12480, 12960,
    13440, 14400, 14880,
    15360, 16320, 16800, 17280, 18240, 18720,
    19200, 20160, 20640, 21120, 22080, 22560,
  ] as const);

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
    expect(bassEvents).toBe(13);
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
    /*
     * The register spans 20 semitones, so an octave leap is 12. The bound is a
     * major sixth: a root near the 33 floor has no fifth below it inside the
     * register, so the nearest placement of that fifth is genuinely a sixth up
     * — B1 to G2 in bar 1 — and that is a bass line moving, not leaping.
     */
    expect(widest).toBeLessThanOrEqual(9);
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

      /* The bar cycle: a positive length with one velocity offset per phase. */
      expect(Number.isInteger(style.barCycleLength)).toBe(true);
      expect(style.barCycleLength).toBeGreaterThanOrEqual(1);
      expect(style.barCycleVelocityOffsets.length).toBe(style.barCycleLength);
      for (const accent of style.barCycleVelocityOffsets) {
        expect(Number.isInteger(accent)).toBe(true);
      }

      /* The swing ratio: rational, at least straight, strictly inside a beat. */
      const swing = style.swingRatio;
      expect(Number.isInteger(swing.numerator)).toBe(true);
      expect(Number.isInteger(swing.denominator)).toBe(true);
      expect(swing.denominator).toBeGreaterThanOrEqual(1);
      expect(swing.numerator * 2).toBeGreaterThanOrEqual(swing.denominator);
      expect(swing.numerator).toBeLessThan(swing.denominator);

      const slots = [...style.bassSlots, ...style.compSlots];
      for (const slot of slots) {
        const offset = slot.offsetBeats;
        const duration = slot.durationBeats;
        expect((offset.numerator * TICKS_PER_BEAT) % offset.denominator).toBe(0);
        expect(
          (duration.numerator * TICKS_PER_BEAT) % duration.denominator,
        ).toBe(0);
        const offsetTicks = declaredOffsetTicks(offset);
        expect(offsetTicks).toBeGreaterThanOrEqual(0);
        expect(offsetTicks).toBeLessThan(TICKS_PER_BAR);
        /* Swing may never push a slot out of the bar it was written in. */
        const swungTicks = independentlySwung(offsetTicks, style);
        expect(Number.isInteger(swungTicks)).toBe(true);
        expect(swungTicks).toBeGreaterThanOrEqual(0);
        expect(swungTicks).toBeLessThan(TICKS_PER_BAR);
        /* Every named phase exists in this style's cycle. */
        expect(slot.cyclePhases.length).toBeGreaterThan(0);
        for (const phase of slot.cyclePhases) {
          expect(Number.isInteger(phase)).toBe(true);
          expect(phase).toBeGreaterThanOrEqual(0);
          expect(phase).toBeLessThan(style.barCycleLength);
        }
        /*
         * X0 refuses a non-integer velocity and that refusal FAULTS the
         * transport, where a performance-layer refusal only costs the sketch.
         * The table is the only source of an emitted velocity, so integrality
         * is asserted here rather than left to the emitter to discover — and
         * the bar-cycle accent must keep every phase inside 1..127 too.
         */
        expect(Number.isInteger(slot.velocity)).toBe(true);
        expect(slot.velocity).toBeGreaterThanOrEqual(1);
        expect(slot.velocity).toBeLessThanOrEqual(127);
        for (const accent of style.barCycleVelocityOffsets) {
          expect(slot.velocity + accent).toBeGreaterThanOrEqual(1);
          expect(slot.velocity + accent).toBeLessThanOrEqual(127);
        }
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
    const bassOffsets = new Set(
      style.bassSlots.map((slot) =>
        independentlySwung(declaredOffsetTicks(slot.offsetBeats), style),
      ),
    );
    const compOffsets = new Set(
      style.compSlots.map((slot) =>
        independentlySwung(declaredOffsetTicks(slot.offsetBeats), style),
      ),
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
      /* Both roles also always sound at their own chord's arrival. */
      const arrival = event.startTick === chordStarts.get(sourceId);
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

function eventsInBar(
  plan: PlaybackPlan,
  bar: number,
  role: EmittedRole | null = null,
): readonly PlaybackPlan["events"][number][] {
  const start = bar * TICKS_PER_BAR;
  return plan.events.filter(
    (event) =>
      event.startTick >= start &&
      event.startTick < start + TICKS_PER_BAR &&
      (role === null || roleOf(event.eventId) === role),
  );
}

describe("the seeded Deacon Blues chart as a performance", () => {
  test("has strictly more events, real syncopation, and bass in every bar", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);

    expect(literal.events.length).toBe(10);
    /*
     * Twenty-six: every one of the ten written chords states itself with a
     * bass note AND its own voicing at its own arrival (20), and the three
     * phase-0 bars whose last chord reaches the and of 3 add the swung bass
     * answer and its soft comp reply (6).
     */
    expect(performance.events.length).toBe(26);
    expect(performance.events.length).toBeGreaterThan(literal.events.length);

    const offBeat = performance.events.filter(
      (event) => event.startTick % TICKS_PER_BEAT !== 0,
    );
    /*
     * Six of the twenty-six are off the beat: the swung and-of-3 answer in
     * bars 1, 3 and 5, each a bass note and a comp reply together. Nothing
     * else in this style leaves the beat.
     */
    expect(offBeat.length).toBe(6);
    expect(
      new Set(offBeat.map((event) => event.startTick % TICKS_PER_BAR)),
    ).toEqual(new Set([2460]));
    /* The literal chart is entirely on the beat; the performance is not. */
    expect(
      literal.events.filter((event) => event.startTick % TICKS_PER_BEAT !== 0)
        .length,
    ).toBe(0);

    const barCount = performance.totalTicks / TICKS_PER_BAR;
    expect(barCount).toBe(6);
    for (let bar = 0; bar < barCount; bar += 1) {
      const inBar = eventsInBar(performance, bar, "bass");
      expect(
        inBar.every((event) =>
          event.midiPitches.every(
            (midi) =>
              midi >= PERFORMANCE_BASS_REGISTER.lowMidi &&
              midi <= PERFORMANCE_BASS_REGISTER.highMidi,
          ),
        ),
      ).toBe(true);
      /* Every bar has bass, and the half-time cycle makes the count differ. */
      expect(inBar.length).toBeGreaterThan(0);
    }
    expect(
      Array.from({ length: barCount }, (_unused, bar) =>
        eventsInBar(performance, bar, "bass").length,
      ),
    ).toEqual([3, 2, 3, 2, 2, 1]);

    /*
     * The comp answers the bass one for one: a stated harmony wherever a bass
     * note announces a chord, plus the and-of-3 reply wherever the bass
     * answers itself.
     */
    expect(
      Array.from({ length: barCount }, (_unused, bar) =>
        eventsInBar(performance, bar, "comp").length,
      ),
    ).toEqual([3, 2, 3, 2, 2, 1]);

    /*
     * THE REGRESSION THIS TEST EXISTS FOR. Slot offsets are bar-relative and
     * this chart is mostly two chords to a bar, so before the arrival law the
     * second chord of nearly every bar reached no offset-0 slot at all: it was
     * announced by a lone bass note and never stated its harmony. Every source
     * chord must have a comp starting exactly at its own start tick, sounding
     * ITS pitches — not the pitches of the chord on either side of it.
     */
    const stated = new Map<number, readonly number[]>();
    for (const event of performance.events) {
      if (roleOf(event.eventId) !== "comp") continue;
      if (stated.has(Number(event.startTick))) continue;
      stated.set(Number(event.startTick), [...event.midiPitches]);
    }
    const missing: string[] = [];
    const wrongPitches: string[] = [];
    for (let index = 0; index < literal.events.length; index += 1) {
      const chord = literal.events[index];
      if (chord === undefined) throw new Error("PERFORMANCE_TEST_CHORD");
      const sounded = stated.get(Number(chord.startTick));
      if (sounded === undefined) {
        missing.push(`${String(chord.eventId)}@${String(chord.startTick)}`);
        continue;
      }
      /*
       * ballad-comp@1 states the arrival with the whole written voicing,
       * octave-transposed as a unit into its comping register: same voices,
       * same intervals, same pitch classes, a different octave. Anything that
       * is not an octave transposition of a top slice of the written chord is
       * a re-voicing, and a re-voicing here would be this layer overruling the
       * document's pinned voicing policy.
       */
      const slice = octaveTransposedTopSliceOf(chord.midiPitches, sounded);
      if (slice === null) {
        wrongPitches.push(
          `${String(chord.eventId)}:${sounded.join("/")}`
          + `!=${chord.midiPitches.join("/")}+12k`,
        );
      }
      /* And it is genuinely this chord's harmony, not the neighbour's. */
      const previous = literal.events[index - 1];
      if (previous !== undefined) {
        expect(sounded.join("/")).not.toBe(previous.midiPitches.join("/"));
      }
    }
    expect(missing).toEqual([]);
    expect(wrongPitches).toEqual([]);
  });

  test("the two-chords-per-bar case gives each chord its own root bass", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    /* Bar 1 holds Cmaj7 then Bm7#5; both must be announced in the bass. */
    const firstBar = eventsInBar(performance, 0, "bass");
    /* Root on 1, the beat-3 arrival root, then the swung and-of-3 answer. */
    expect(firstBar.map((event) => Number(event.startTick))).toEqual([
      0, 1920, 2460,
    ]);
    expect(
      firstBar.slice(0, 2).map((event) => ((event.midiPitches[0] % 12) + 12) % 12),
    ).toEqual([0, 11]);
  });

  test("the bass implies half-time: the downbeat root rings, it does not plod", () => {
    const performance = performed(deaconBluesLiteralPlan());
    /*
     * Bar 5 is one whole-bar chord in a phase-0 bar, so nothing truncates the
     * pattern: the root holds 2.5 beats (to the swung and-of-3) and the answer
     * holds the rest. A plodding 1-and-3 bass would show two equal halves.
     */
    const bar5 = eventsInBar(performance, 4, "bass");
    expect(
      bar5.map((event) => [
        Number(event.startTick) - 4 * TICKS_PER_BAR,
        Number(event.durationTicks),
      ]),
    ).toEqual([
      [0, 2460],
      [2460, 1380],
    ]);
    /*
     * Bar 6 is a phase-1 bar with one chord: the root rings the entire bar and
     * nothing answers it at all.
     */
    const bar6 = eventsInBar(performance, 5, "bass");
    expect(bar6.length).toBe(1);
    expect(Number(bar6[0]?.durationTicks)).toBe(TICKS_PER_BAR);
  });

  test("the comp breathes: never a stab on every beat, and never two at once", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);

    const chordsInBar = (bar: number): number =>
      literal.events.filter(
        (event) =>
          event.startTick >= bar * TICKS_PER_BAR &&
          event.startTick < (bar + 1) * TICKS_PER_BAR,
      ).length;

    for (let bar = 0; bar < 6; bar += 1) {
      const comps = eventsInBar(performance, bar, "comp");
      /*
       * The honest bound for this design: one stated harmony per chord that
       * arrives in the bar, plus at most the single and-of-3 answer. Anything
       * beyond that is the comp playing more than the table declares.
       */
      expect(comps.length).toBeLessThanOrEqual(chordsInBar(bar) + 1);

      /*
       * The comp still breathes. It is no longer measured by sounding ticks —
       * the stated harmony is meant to RING through its chord — but by attack
       * density: a bar in which a comp begins on all four beats is a machine,
       * not a player.
       */
      const attackBeats = new Set(
        comps.map((event) =>
          Math.floor((event.startTick - bar * TICKS_PER_BAR) / TICKS_PER_BEAT),
        ),
      );
      expect(attackBeats.size).toBeLessThan(4);
    }

    /*
     * And comps never stack: two voicings sounding at once would be two
     * different chords played simultaneously, which is the audible form of the
     * arrival bug's opposite failure.
     */
    const comps = performance.events.filter(
      (event) => roleOf(event.eventId) === "comp",
    );
    expect(comps.length).toBe(13);
    const overlaps: string[] = [];
    for (let index = 1; index < comps.length; index += 1) {
      const previous = comps[index - 1];
      const current = comps[index];
      if (previous === undefined || current === undefined) {
        throw new Error("PERFORMANCE_TEST_COMP_ORDER");
      }
      if (
        Number(previous.startTick) + Number(previous.durationTicks) >
        Number(current.startTick)
      ) {
        overlaps.push(
          `${String(previous.eventId)}->${String(current.eventId)}`,
        );
      }
    }
    expect(overlaps).toEqual([]);
  });

  test("the two-bar cycle makes adjacent bars genuinely different", () => {
    const performance = performed(deaconBluesLiteralPlan());
    const shape = (bar: number): string =>
      eventsInBar(performance, bar)
        .map(
          (event) =>
            `${String(roleOf(event.eventId))}@`
            + String(event.startTick - bar * TICKS_PER_BAR)
            + `v${String(event.velocity)}`,
        )
        .join(" ");
    /* Bars 1 and 3 share a phase; bars 2 and 4 share the other one. */
    expect(shape(0)).toBe(shape(2));
    expect(shape(1)).toBe(shape(3));
    /* Adjacent bars never do. */
    for (const [left, right] of [
      [0, 1],
      [1, 2],
      [2, 3],
    ] as const) {
      expect(`bar ${String(left + 1)}: ${shape(left)}`).not.toBe(
        `bar ${String(left + 1)}: ${shape(right)}`,
      );
    }
    /*
     * The phase-1 bars are also eased by the declared bar-cycle accent, so the
     * difference is dynamic and not only rhythmic.
     */
    const loudest = (bar: number): number =>
      Math.max(...eventsInBar(performance, bar).map((event) => event.velocity));
    expect(loudest(0)).toBe(92);
    expect(loudest(1)).toBe(87);
  });

  test("velocities vary, stay integral, and keep the downbeat bass on top", () => {
    const performance = performed(deaconBluesLiteralPlan());
    const velocities = new Set<number>();
    for (const event of performance.events) {
      expect(Number.isInteger(event.velocity)).toBe(true);
      expect(event.velocity).toBeGreaterThanOrEqual(1);
      expect(event.velocity).toBeLessThanOrEqual(127);
      velocities.add(event.velocity);
    }
    /* A real player is not a single velocity, nor two. */
    expect(velocities.size).toBeGreaterThanOrEqual(5);
    const loudestBass = Math.max(
      ...performance.events
        .filter((event) => roleOf(event.eventId) === "bass")
        .map((event) => event.velocity),
    );
    const loudestComp = Math.max(
      ...performance.events
        .filter((event) => roleOf(event.eventId) === "comp")
        .map((event) => event.velocity),
    );
    expect(loudestBass).toBe(92);
    /* Every comp, stated arrival included, sits under the downbeat bass. */
    expect(loudestComp).toBeLessThan(loudestBass);
  });
});

/* ------------------------------------------------------------------ */
/* The comp register: where the comping hand actually sits.             */
/* ------------------------------------------------------------------ */

const BAND_SKETCH_STYLE_IDS = PERFORMANCE_STYLE_IDS.filter(
  (styleId) => PERFORMANCE_STYLES[styleId].kind === "band-sketch",
);

type CompFacts = Readonly<{
  eventId: string;
  startTick: number;
  pitches: readonly number[];
  lowest: number;
  highest: number;
  span: number;
  bass: number | null;
}>;

function compFactsOf(performance: PlaybackPlan): readonly CompFacts[] {
  const facts: CompFacts[] = [];
  for (const event of performance.events) {
    if (roleOf(event.eventId) !== "comp") continue;
    const pitches = [...event.midiPitches].sort((left, right) => left - right);
    const lowest = pitches[0] ?? 0;
    const highest = pitches[pitches.length - 1] ?? 0;
    facts.push(
      Object.freeze({
        eventId: String(event.eventId),
        startTick: Number(event.startTick),
        pitches: Object.freeze(pitches),
        lowest,
        highest,
        span: highest - lowest,
        bass: bassSoundingAt(performance, Number(event.startTick)),
      }),
    );
  }
  return Object.freeze(facts);
}

describe("the comp register", () => {
  test("the register policy publishes exactly the numbers this file assumes", () => {
    /*
     * This file re-implements the placement law from three literals. If the
     * production constants are ever re-tuned, THIS test fails — rather than
     * the re-implementation quietly following the source it exists to check.
     */
    expect(PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES).toBe(
      SEPARATION_SEMITONES,
    );
    expect(PERFORMANCE_COMP_MAX_SPAN_SEMITONES).toBe(MAX_COMP_SPAN_SEMITONES);
    expect(PERFORMANCE_COMP_MIN_WIDTH_VOICES).toBe(MIN_COMP_WIDTH_VOICES);
    expect(PERFORMANCE_COMP_REGISTER_POLICY_VERSION).toBe(1);
  });

  test("every declared register is frozen, and its bounds make the law total", () => {
    for (const styleId of PERFORMANCE_STYLE_IDS) {
      const style = PERFORMANCE_STYLES[styleId];
      if (style.kind === "literal") {
        /* The identity style has no comping hand and must not declare one. */
        expect(style.compRegister).toBeNull();
        continue;
      }
      const register = registerOf(style);
      expect(Object.isFrozen(register)).toBe(true);
      for (const bound of [
        register.lowMidi,
        register.highMidi,
        register.ceilingMidi,
      ]) {
        expect(Number.isInteger(bound)).toBe(true);
        expect(bound).toBeGreaterThanOrEqual(0);
        expect(bound).toBeLessThanOrEqual(127);
      }
      /*
       * The home octave is twelve consecutive semitones, so exactly one
       * placement qualifies for any pitch class and normalization needs no
       * tie-break; `highMidi` is the octave above it, the most a separation
       * lift may add.
       */
      expect(register.highMidi).toBe(register.lowMidi + 23);
      /*
       * The two inequalities the placement law's termination rests on: ONE
       * lift always clears the highest note the bass register can produce,
       * and a lifted single voice can never exceed the ceiling.
       */
      expect(register.lowMidi + 12).toBeGreaterThanOrEqual(
        PERFORMANCE_BASS_REGISTER.highMidi + SEPARATION_SEMITONES,
      );
      expect(register.highMidi).toBeLessThanOrEqual(register.ceilingMidi);
    }
    /* The two band sketches are placed differently on purpose. */
    expect(registerOf(PERFORMANCE_STYLES["ballad-comp@1"]).lowMidi).toBe(58);
    expect(registerOf(PERFORMANCE_STYLES["medium-swing@1"]).lowMidi).toBe(60);
  });

  test("every comp sits inside its style's register, and a lift is always forced", () => {
    const literal = deaconBluesLiteralPlan();
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const style = PERFORMANCE_STYLES[styleId];
      const register = registerOf(style);
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`REGISTER_COMPILE:${styleId}`);
      const facts = compFactsOf(result.plan);
      expect(facts.length).toBeGreaterThan(0);
      const outside: string[] = [];
      const unforced: string[] = [];
      for (const comp of facts) {
        if (
          comp.lowest < register.lowMidi ||
          comp.lowest > register.highMidi
        ) {
          outside.push(`${comp.eventId}:${String(comp.lowest)}`);
        }
        /*
         * A comp above the HOME octave is there only because the bass under it
         * left no room: the home placement would have been inside a minor
         * ninth of that bass. Nothing else may lift a comp out of its home
         * octave, which is what keeps the absolute register from wandering.
         */
        if (comp.lowest > register.lowMidi + 11) {
          const bass = comp.bass;
          if (bass === null || comp.lowest - 12 >= bass + SEPARATION_SEMITONES) {
            unforced.push(`${comp.eventId}:${String(comp.lowest)}`);
          }
        }
      }
      expect(`${styleId}:${outside.join(",")}`).toBe(`${styleId}:`);
      expect(`${styleId}:${unforced.join(",")}`).toBe(`${styleId}:`);
    }
  });

  test("every comp clears the bass under it by a minor ninth", () => {
    const literal = deaconBluesLiteralPlan();
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`SEPARATION_COMPILE:${styleId}`);
      const performance = result.plan;
      const crowded: string[] = [];
      for (const comp of compFactsOf(performance)) {
        /*
         * The bass sounding under the comp's own attack, and — a stronger
         * question than the placement rule itself asks — every bass note that
         * sounds at any point while the comp is still ringing.
         */
        const under: number[] = [];
        const at = comp.bass;
        if (at !== null) under.push(at);
        const compEnd =
          comp.startTick
          + Number(
            performance.events.find(
              (event) => String(event.eventId) === comp.eventId,
            )?.durationTicks ?? 0,
          );
        for (const event of performance.events) {
          if (roleOf(event.eventId) !== "bass") continue;
          const start = Number(event.startTick);
          if (start >= compEnd) break;
          if (start + Number(event.durationTicks) <= comp.startTick) continue;
          under.push(Number(event.midiPitches[0]));
        }
        for (const bass of under) {
          if (comp.lowest - bass < SEPARATION_SEMITONES) {
            crowded.push(
              `${comp.eventId}:${String(comp.lowest)}-${String(bass)}`,
            );
          }
        }
      }
      expect(`${styleId}:${crowded.join(",")}`).toBe(`${styleId}:`);
    }
  });

  test("no comp is wider than a nineteenth, and none sounds above the ceiling", () => {
    const literal = deaconBluesLiteralPlan();
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const register = registerOf(PERFORMANCE_STYLES[styleId]);
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`SPAN_COMPILE:${styleId}`);
      const wide: string[] = [];
      const high: string[] = [];
      for (const comp of compFactsOf(result.plan)) {
        if (comp.span > MAX_COMP_SPAN_SEMITONES) {
          wide.push(`${comp.eventId}:${String(comp.span)}`);
        }
        if (comp.highest > register.ceilingMidi) {
          high.push(`${comp.eventId}:${String(comp.highest)}`);
        }
        /* The width rule never thins a comp past three voices. */
        expect(comp.pitches.length).toBeGreaterThanOrEqual(
          MIN_COMP_WIDTH_VOICES,
        );
      }
      expect(`${styleId}:${wide.join(",")}`).toBe(`${styleId}:`);
      expect(`${styleId}:${high.join(",")}`).toBe(`${styleId}:`);
    }
  });

  test("normalization transposes: it never re-voices, respells or invents", () => {
    const literal = deaconBluesLiteralPlan();
    const sourceByEventId = new Map<string, readonly number[]>();
    const sourceClasses = new Map<string, ReadonlySet<number>>();
    for (const event of literal.events) {
      sourceByEventId.set(String(event.eventId), [...event.midiPitches]);
      sourceClasses.set(
        String(event.eventId),
        new Set(event.midiPitches.map((midi) => ((midi % 12) + 12) % 12)),
      );
    }
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`CLASSES_COMPILE:${styleId}`);
      let checked = 0;
      for (const comp of compFactsOf(result.plan)) {
        const sourceId = sourceIdOf(comp.eventId);
        const source = sourceByEventId.get(sourceId);
        const classes = sourceClasses.get(sourceId);
        if (source === undefined || classes === undefined) {
          throw new Error(`CLASSES_SOURCE:${comp.eventId}`);
        }
        /*
         * The whole law in one predicate: what sounds is the written chord's
         * own top voices, every one of them moved by the SAME whole number of
         * octaves. Intervals, order and spelling survive; only the octave
         * moves.
         */
        const slice = octaveTransposedTopSliceOf(source, comp.pitches);
        expect(`${comp.eventId}:${comp.pitches.join("/")}`).toBe(
          slice === null
            ? `${comp.eventId}:not-an-octave-transposition-of-${source.join("/")}`
            : `${comp.eventId}:${comp.pitches.join("/")}`,
        );
        if (slice === null) continue;
        checked += 1;
        /* Every sounding pitch class is one the written chord sounds. */
        for (const midi of comp.pitches) {
          expect(classes.has(((midi % 12) + 12) % 12)).toBe(true);
        }
        /*
         * And when no voice was dropped, the pitch-class SET is the written
         * chord's, exactly: transposition preserves harmony.
         */
        if (slice.dropped === 0) {
          expect(
            [...new Set(comp.pitches.map((m) => ((m % 12) + 12) % 12))].sort(
              (left, right) => left - right,
            ),
          ).toEqual([...classes].sort((left, right) => left - right));
        }
      }
      /* Thirteen ballad comps, twenty-two Charleston stabs — all of them. */
      expect(`${styleId}:${String(checked)}`).toBe(
        `${styleId}:${styleId === "ballad-comp@1" ? "13" : "22"}`,
      );
    }
  });

  test("the compiler agrees with the independently derived placement, comp for comp", () => {
    const literal = deaconBluesLiteralPlan();
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const style = PERFORMANCE_STYLES[styleId];
      const register = registerOf(style);
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`PLACEMENT_COMPILE:${styleId}`);
      const disagreements: string[] = [];
      for (const comp of compFactsOf(result.plan)) {
        const sourceId = sourceIdOf(comp.eventId);
        const chord = literal.events.find(
          (event) => String(event.eventId) === sourceId,
        );
        if (chord === undefined) throw new Error(`PLACEMENT_SOURCE:${sourceId}`);
        /*
         * Both declared voicing rules are tried and exactly one must produce
         * the emitted notes: the placement is re-derived from the contract, so
         * agreeing with it is a real claim about the compiler's arithmetic.
         */
        const derived = new Set(
          (["all", "upper-voices"] as const).map((voicing) =>
            independentlyPlacedComp(
              compVoicesOf(chord.midiPitches, voicing),
              comp.bass,
              register,
            ).join("/"),
          ),
        );
        if (!derived.has(comp.pitches.join("/"))) {
          disagreements.push(
            `${comp.eventId}:${comp.pitches.join("/")}`
            + `!in{${[...derived].join(" ")}}`,
          );
        }
      }
      expect(`${styleId}:${disagreements.join(",")}`).toBe(`${styleId}:`);
    }
  });

  test("the register laws are real gates: the WRITTEN voicings fail all three", () => {
    /*
     * The control, and it is the owner's own bug report restated as a
     * measurement. Every number below is a defect of the chart as P0 compiles
     * it — the Auto policy scores candidates for voice leading, which is a
     * relative law, so absolute register wanders and collides with the bass.
     * If the laws above were vacuous, these counts would all be zero.
     */
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    let outsideRegister = 0;
    let crowdingTheBass = 0;
    let inUnisonOrBelow = 0;
    let tooWide = 0;
    const register = registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]);
    for (const chord of literal.events) {
      const written = [...chord.midiPitches].sort((a, b) => a - b);
      const lowest = written[0] ?? 0;
      const highest = written[written.length - 1] ?? 0;
      const bass = bassSoundingAt(performance, Number(chord.startTick));
      if (bass === null) throw new Error("CONTROL_NO_BASS");
      if (lowest < register.lowMidi || lowest > register.highMidi) {
        outsideRegister += 1;
      }
      if (lowest - bass < SEPARATION_SEMITONES) crowdingTheBass += 1;
      if (lowest <= bass) inUnisonOrBelow += 1;
      if (highest - lowest > MAX_COMP_SPAN_SEMITONES) tooWide += 1;
    }
    /*
     * Bars 3, 5 and 6 write their voicing below Bb3; bars 2, 3, 5 and 6 write
     * it inside a minor ninth of the bass; bars 3 and 5 write its lowest note
     * in UNISON with the bass note under it (MIDI 50 and 51, exactly the two
     * collisions in the report); five of the ten written voicings span more
     * than a nineteenth.
     */
    expect(outsideRegister).toBe(4);
    expect(crowdingTheBass).toBe(5);
    expect(inUnisonOrBelow).toBe(3);
    expect(tooWide).toBe(5);
  });

  test("the seeded chart's comps are pinned, bar by bar", () => {
    /*
     * The re-derived expectation. Read as music: the comping hand states every
     * chord between C4 and C6 with its bottom voice inside Bb3..C5, under a
     * bass line that never comes within a minor ninth of it.
     */
    const performance = performed(deaconBluesLiteralPlan());
    expect(
      compFactsOf(performance).map(
        (comp) => `${String(comp.startTick)}:${comp.pitches.join("/")}`,
      ),
    ).toEqual([
      "0:60/64/67/71",
      "1920:69/74/79",
      "2460:69/74/79",
      "3840:69/74/77",
      "5760:69/77/79/84",
      "7680:66/81/85",
      "9600:69/76/83",
      "10140:69/76/83",
      "11520:72/76/79/83",
      "13440:71/74/79/81",
      "15360:70/74/79",
      "17820:70/74/79",
      "19200:68/74/79",
    ]);
    /* The whole comping voice now lives inside one octave and a fourth. */
    const bottoms = compFactsOf(performance).map((comp) => comp.lowest);
    expect(Math.min(...bottoms)).toBe(60);
    expect(Math.max(...bottoms)).toBe(72);
    /* The bass line is untouched by this work; it is pinned as the control. */
    expect(
      performance.events
        .filter((event) => roleOf(event.eventId) === "bass")
        .map((event) => Number(event.midiPitches[0])),
    ).toEqual([36, 35, 43, 46, 45, 50, 49, 45, 48, 47, 51, 46, 40]);
  });

  test("block-chords@1 is untouched: the identity keeps the written registers", () => {
    const literal = deaconBluesLiteralPlan();
    const result = compilePerformancePlan({
      plan: literal,
      styleId: "block-chords@1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("REGISTER_IDENTITY");
    /* The very same object, byte for byte, with no register policy applied. */
    expect(result.plan).toBe(literal);
    expect(JSON.stringify(result.plan)).toBe(JSON.stringify(literal));
    expect(PERFORMANCE_STYLES["block-chords@1"].compRegister).toBeNull();
    /*
     * And it demonstrably still sounds notes the ballad register would have
     * moved: MIDI 49, 50, 51, 52 and 54 all sit below the ballad's window low,
     * and 49, 50 and 51 are exactly the written notes that collided with the
     * bass in the report.
     */
    const ballad = registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]);
    expect(
      result.plan.events
        .flatMap((event) => [...event.midiPitches].map((midi) => Number(midi)))
        .filter((midi) => midi < ballad.lowMidi)
        .sort((left, right) => left - right),
    ).toEqual([49, 50, 51, 52, 54]);
  });

  test("the register fix is deterministic in every band-sketch style", () => {
    const literal = deaconBluesLiteralPlan();
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const first = compilePerformancePlan({ plan: literal, styleId });
      const second = compilePerformancePlan({ plan: literal, styleId });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error(`DETERMINISM:${styleId}`);
      expect(first.plan).not.toBe(second.plan);
      expect(JSON.stringify(first.plan)).toBe(JSON.stringify(second.plan));
      expect(first.evidence).toEqual(second.evidence);
    }
  });
});

/* ------------------------------------------------------------------ */
/* One attack per role per tick: no doubled stab, no flammed bass.      */
/* ------------------------------------------------------------------ */

describe("the one-attack-per-tick law", () => {
  test("no style ever attacks the same role twice at the same tick", () => {
    /*
     * The arrival law adds a bass note and a voicing at every chord's own
     * start. Where a style's TABLE already declares a slot landing on that
     * tick, adding another emits two voicings at once — a doubled stab, heard
     * as a flam and structurally two chords sounding together. The guard is
     * asked of the EMITTED tick, swing displacement included, never of the
     * written offset.
     */
    const literal = deaconBluesLiteralPlan();
    for (const styleId of PERFORMANCE_STYLE_IDS) {
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`ATTACK_COMPILE:${styleId}`);
      const seen = new Set<string>();
      const doubled: string[] = [];
      for (const event of result.plan.events) {
        const role = roleOf(event.eventId);
        const key = `${String(role)}@${String(event.startTick)}`;
        if (seen.has(key)) doubled.push(`${String(event.eventId)}:${key}`);
        seen.add(key);
      }
      expect(`${styleId}:${doubled.join(",")}`).toBe(`${styleId}:`);
    }
  });

  test("a table's own offset-0 slot is the statement; the arrival law adds nothing", () => {
    /*
     * The collision in its concrete form. ballad-comp@1 declares BOTH a bass
     * and a comp at offset 0, so every bar-aligned chord reaches a declared
     * slot on its own start tick AND is a candidate for the arrival law. The
     * declared slot wins and exactly one of each sounds there.
     *
     * The guard is asked of the tick a slot is ACTUALLY played at. c1 and b1
     * are written at offset 5/2 and swung to 2460, so a comparison against
     * declared offsets rather than emitted ticks would answer a different
     * question for exactly the slots this style displaces.
     */
    const style = PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE];
    expect(
      style.compSlots.map((slot) => declaredOffsetTicks(slot.offsetBeats)),
    ).toEqual([0, 2400]);
    expect(
      style.bassSlots.map((slot) => declaredOffsetTicks(slot.offsetBeats)),
    ).toEqual([0, 2400]);
    expect(independentlySwung(2400, style)).toBe(2460);

    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    const barAligned = literal.events
      .map((event) => Number(event.startTick))
      .filter((tick) => tick % TICKS_PER_BAR === 0);
    expect(barAligned).toEqual([0, 3840, 7680, 11520, 15360, 19200]);
    for (const tick of barAligned) {
      for (const role of ["bass", "comp"] as const) {
        expect(
          `${role}@${String(tick)}:`
          + String(
            performance.events.filter(
              (event) =>
                Number(event.startTick) === tick &&
                roleOf(event.eventId) === role,
            ).length,
          ),
        ).toBe(`${role}@${String(tick)}:1`);
      }
    }
  });

  test("medium-swing@1 states each chord once, and its stab count is pinned", () => {
    /*
     * The style the duplicate would show up in first: its Charleston stabs sit
     * on the and-of-2 and the and-of-4, and the arrival law adds one more at
     * every chord's own start. Thirteen bass attacks per bar-full of walking
     * quarters and twenty-two comps, with every chord stated exactly once.
     */
    const literal = deaconBluesLiteralPlan();
    const result = compilePerformancePlan({
      plan: literal,
      styleId: "medium-swing@1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("MEDIUM_SWING_COMPILE");
    const comps = result.plan.events.filter(
      (event) => roleOf(event.eventId) === "comp",
    );
    const basses = result.plan.events.filter(
      (event) => roleOf(event.eventId) === "bass",
    );
    expect(result.plan.events.length).toBe(46);
    expect(comps.length).toBe(22);
    expect(basses.length).toBe(24);
    expect(new Set(comps.map((event) => Number(event.startTick))).size).toBe(
      comps.length,
    );
    expect(new Set(basses.map((event) => Number(event.startTick))).size).toBe(
      basses.length,
    );
    /* Every written chord is stated exactly once, at its own start tick. */
    for (const chord of literal.events) {
      expect(
        comps.filter(
          (event) => Number(event.startTick) === Number(chord.startTick),
        ).length,
      ).toBe(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The arrival law: a chord is heard as a chord the moment it arrives.  */
/* ------------------------------------------------------------------ */

describe("the arrival law", () => {
  test("every source chord states its own harmony at its own arrival, in every style", () => {
    /*
     * The law whose absence produced the reported defect. Slot offsets are
     * BAR-relative; the seeded chart is mostly two chords to a bar; so a chord
     * beginning mid-bar reached none of the offset-0 slots where the voicing
     * lives, and the second chord of nearly every bar was announced by a lone
     * bass note that never stated any harmony at all. Nothing in the suite
     * said that was illegal, so nothing caught it.
     *
     * It is asserted for EVERY declared style, including the literal identity
     * style, because it is a fact about music and not about one table.
     */
    const literal = deaconBluesLiteralPlan();
    const measureIndices = writtenMeasureIndices(literal);
    expect(measureIndices.size).toBe(6);

    for (const styleId of PERFORMANCE_STYLE_IDS) {
      const style = PERFORMANCE_STYLES[styleId];
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`ARRIVAL_COMPILE:${styleId}`);

      const silent: string[] = [];
      const wrong: string[] = [];
      for (const chord of literal.events) {
        const measureIndex = measureIndices.get(chord.measureId);
        if (measureIndex === undefined) {
          throw new Error(`ARRIVAL_MEASURE:${String(chord.eventId)}`);
        }
        /*
         * The literal style returns the chart itself, so the chord's own event
         * IS the statement; a band sketch states it with a comp.
         */
        const stating = result.plan.events.filter(
          (event) =>
            Number(event.startTick) === Number(chord.startTick) &&
            (style.kind === "literal" || roleOf(event.eventId) === "comp"),
        );
        if (stating.length !== 1) {
          silent.push(
            `${styleId}/${String(chord.eventId)}:${String(stating.length)}`,
          );
          continue;
        }
        const voicing =
          style.kind === "literal"
            ? "all"
            : arrivalCompVoicing(style, measureIndex);
        if (voicing === null) {
          throw new Error(`ARRIVAL_VOICING:${styleId}`);
        }
        const chosen = compVoicesOf(chord.midiPitches, voicing);
        const statement = stating[0];
        const sounded = [...(statement?.midiPitches ?? [])];
        /*
         * The statement is that chord's voices, placed by the frozen register
         * law — re-derived here, not imported. The literal style has no
         * comping hand and no register, so it must sound the written notes
         * exactly as written.
         */
        const expected =
          style.compRegister === null
            ? chosen
            : independentlyPlacedComp(
                chosen,
                bassSoundingAt(
                  result.plan,
                  Number(statement?.startTick ?? chord.startTick),
                ),
                style.compRegister,
              );
        if (sounded.join("/") !== [...expected].join("/")) {
          wrong.push(
            `${styleId}/${String(chord.eventId)}`
            + `:${sounded.join("/")}!=${[...expected].join("/")}`,
          );
        }
      }
      expect(silent).toEqual([]);
      expect(wrong).toEqual([]);
    }
  });

  test("the arrival statement is a real gate: a neighbour's pitches would fail it", () => {
    /*
     * The control. Every chord of this chart voices differently from the chord
     * before it, so a statement carrying the previous chord's pitches — the
     * exact shape the removed anticipation had — is detectably wrong rather
     * than indistinguishable from the truth.
     */
    const literal = deaconBluesLiteralPlan();
    const distinct = new Set<string>();
    for (let index = 1; index < literal.events.length; index += 1) {
      const previous = literal.events[index - 1];
      const current = literal.events[index];
      if (previous === undefined || current === undefined) {
        throw new Error("ARRIVAL_CONTROL");
      }
      expect(current.midiPitches.join("/")).not.toBe(
        previous.midiPitches.join("/"),
      );
      distinct.add(current.midiPitches.join("/"));
    }
    expect(distinct.size).toBeGreaterThan(1);
  });

  test("a mid-bar chord states itself even where the table declares nothing", () => {
    /*
     * The minimal reproduction, independent of the seeded chart: two chords in
     * one 4/4 bar. The second begins on beat 3, where ballad-comp@1 declares no
     * slot at all. It must still be heard as a chord.
     */
    const literal = literalPlanOf(
      publishChart(
        "| Cmaj7 Fmaj7 |",
        meterOf(4, 4),
        "document-performance-mid-bar-arrival",
      ),
    );
    expect(literal.events.map((event) => Number(event.startTick))).toEqual([
      0, 1920,
    ]);
    const second = literal.events[1];
    if (second === undefined) throw new Error("ARRIVAL_MID_BAR_FIXTURE");

    const performance = performed(literal);
    const atArrival = performance.events.filter(
      (event) => Number(event.startTick) === 1920,
    );
    expect(atArrival.map((event) => roleOf(event.eventId)).sort()).toEqual([
      "bass",
      "comp",
    ]);
    const comp = atArrival.find(
      (event) => roleOf(event.eventId) === "comp",
    );
    if (comp === undefined) throw new Error("ARRIVAL_MID_BAR_COMP");
    /*
     * Its own chord's voicing, in the comping register: the same four voices
     * with the same intervals, moved as a unit. The pitch CLASSES are the
     * written chord's, note for note.
     */
    expect([...comp.midiPitches].map((midi) => Number(midi))).toEqual([
      ...independentlyPlacedComp(
        [...second.midiPitches].map((midi) => Number(midi)),
        bassSoundingAt(performance, 1920),
        registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]),
      ),
    ]);
    expect(
      [...comp.midiPitches].map((midi) => ((midi % 12) + 12) % 12).sort(),
    ).toEqual(
      [...second.midiPitches].map((midi) => ((midi % 12) + 12) % 12).sort(),
    );
    expect(sourceIdOf(String(comp.eventId))).toBe(String(second.eventId));
  });
});

describe("swing", () => {
  test("displaces offbeat eighths only, and by the declared ratio", () => {
    const style = PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE];
    /* 9/16 of 960 is 540 exactly: a laid-back eighth, still integer ticks. */
    expect(style.swingRatio).toEqual({ numerator: 9, denominator: 16 });
    expect(independentlySwung(TICKS_PER_BEAT / 2, style)).toBe(540);
    /* On-beat, sixteenth and triplet positions are left exactly alone. */
    expect(independentlySwung(0, style)).toBe(0);
    expect(independentlySwung(TICKS_PER_BEAT, style)).toBe(TICKS_PER_BEAT);
    expect(independentlySwung(240, style)).toBe(240);
    expect(independentlySwung(320, style)).toBe(320);

    const performance = performed(deaconBluesLiteralPlan());
    for (const event of performance.events) {
      const within = event.startTick % TICKS_PER_BEAT;
      /* Nothing is ever emitted at the straight offbeat any more. */
      expect(within).not.toBe(TICKS_PER_BEAT / 2);
      expect(within === 0 || within === 540).toBe(true);
      expect(Number.isInteger(event.startTick)).toBe(true);
    }
  });

  test("a straight style's offsets never move: the arrival law only adds ticks", () => {
    /*
     * The negative control, re-scoped from whole events to TICK OFFSETS.
     *
     * What it still proves, and what the ballad overhaul must never break:
     * swing displacement does not touch a style that declares straight
     * eighths, and the bar cycle does not silence a style that declares one
     * phase. Every tick medium-swing@1 emitted before the arrival law existed
     * is still emitted, at exactly the same place.
     *
     * What legitimately changed: the arrival law applies to every style, so
     * each of the ten written chords gains one comp at its own start. That is
     * an ADDITION and the equality below is exact about it — the expected
     * multiset is the old ticks plus the chord starts, nothing else.
     */
    const straight = PERFORMANCE_STYLES["medium-swing@1"];
    expect(straight.swingRatio).toEqual({ numerator: 1, denominator: 2 });
    expect(straight.barCycleLength).toBe(1);

    const literal = deaconBluesLiteralPlan();
    const result = compilePerformancePlan({
      plan: literal,
      styleId: "medium-swing@1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("SWING_TEST_STRAIGHT");

    const chordArrivals = literal.events.map((event) => Number(event.startTick));
    expect(chordArrivals.length).toBe(10);
    const expectedTicks = [
      ...MEDIUM_SWING_TICKS_BEFORE_THE_ARRIVAL_LAW,
      ...chordArrivals,
    ].sort((left, right) => left - right);
    /* Emitted events are ascending by contract, so this compares in order. */
    expect(
      result.plan.events.map((event) => Number(event.startTick)),
    ).toEqual(expectedTicks);
    expect(result.plan.events.length).toBe(46);

    /*
     * And nothing sits at a swung position. This style's declared offsets are
     * whole beats and the straight and-of-2/and-of-4 (480 into their beat); a
     * 9/16 displacement would put something at 540 instead.
     */
    for (const event of result.plan.events) {
      const within = Number(event.startTick) % TICKS_PER_BEAT;
      expect(within === 0 || within === TICKS_PER_BEAT / 2).toBe(true);
    }
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
    /*
     * The seeded document's own tempo reaches the transport: 116 BPM in 4/4,
     * felt in half time. At 76 the harmonic rhythm of two chords a bar crawled
     * and none of the syncopation below could land.
     */
    expect(scheduled.tempoBpm).toBe(116);
    /* The transport received the performance, not the ten written pads. */
    expect(scheduled.events.length).toBe(26);
    expect(
      scheduled.events.some(
        (event) => event.startTick % TICKS_PER_BEAT !== 0,
      ),
    ).toBe(true);
    expect(
      scheduled.events.some((event) => roleOf(event.eventId) === "bass"),
    ).toBe(true);
    /*
     * And the arrival law holds over the wire, not only in the unit fixture:
     * each emitted event carries the tick of the written chord it came from,
     * and all ten of them have a comp starting exactly there.
     */
    const statedOverTheWire = new Set(
      scheduled.events
        .filter(
          (event) =>
            roleOf(event.eventId) === "comp" &&
            Number(event.startTick) === Number(event.sourceStartTick),
        )
        .map((event) => Number(event.sourceStartTick)),
    );
    expect(statedOverTheWire.size).toBe(10);

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
