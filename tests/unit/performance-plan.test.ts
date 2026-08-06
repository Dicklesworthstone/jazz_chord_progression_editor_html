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
 *
 * The style-shape laws below — comp lengths under a beat, bass lengths under
 * two, three-voice comps, a release before every next attack, a bar that is
 * materially less than fully sounding — are the tuned ballad table's contract
 * with the STYLE STATISTICS it was fitted to. They are stated here as bounds
 * and as numbers re-derived from the emitted plan, never as a restatement of
 * the table, so a future re-tuning that quietly returns to sustained pads
 * fails rather than passes.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

/*
 * The playability proof renders real piano buffers; WALL TIME IS NOT A GATE.
 *
 * 300 s rather than the 120 s this file used to declare, and the reason is
 * measured rather than assumed. Run alone, the wired-studio proof takes 5.5 s
 * — identically before and after the style tuning below, and the tuned table
 * hands the renderer FEWER distinct notes to render (80 against 89). Run as
 * part of the six-file aggregate the release gate names, the same proof sits
 * right on 120 s, because five other files have already driven thousands of
 * buffers through the same process. The aggregate run's total is 167 s tuned
 * against 174 s untuned, so nothing here became slower; the old bound was
 * simply a wall clock standing where a harness guard belongs.
 *
 * It remains a guard against a genuine hang, exactly like the bounded poll
 * inside the proof itself. It is never a musical or a performance criterion.
 */
setDefaultTimeout(300_000);

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
  PERFORMANCE_COMP_TARGET_VOICES,
  PERFORMANCE_RELEASE_GAP_TICKS,
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

/**
 * P0's own release gap, restated here rather than imported: the difference
 * between an event's declared `durationTicks` and the `gateDurationTicks` the
 * engine actually holds. A style table declares the former; the measurement
 * this file checks against names the latter, so the arithmetic between them is
 * part of what has to be proved.
 */
const PLAYBACK_RELEASE_GAP_TICKS = 24;

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

/**
 * The seeded chart's literal plan.
 *
 * MEMOIZED, and it is safe to memoize for exactly two reasons: a compiled plan
 * is deeply frozen, so no test can mutate what the next one reads, and the
 * publication path is deterministic — which the test below re-proves against
 * a SECOND, uncached publication rather than assuming it. Building it fresh
 * for each of the thirty-odd calls in this file re-ran the V2 progression
 * optimizer every time and dominated the file's wall clock.
 */
let deaconBluesLiteralPlanCache: PlaybackPlan | null = null;

function buildDeaconBluesLiteralPlan(documentId: string): PlaybackPlan {
  return literalPlanOf(
    publishChart(STARTER_CHART.chartText, meterOf(4, 4), documentId),
  );
}

function deaconBluesLiteralPlan(): PlaybackPlan {
  deaconBluesLiteralPlanCache ??= buildDeaconBluesLiteralPlan(
    "document-performance-deacon-blues",
  );
  return deaconBluesLiteralPlanCache;
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
    if (!slot.cyclePhases.includes(phase)) continue;
    /*
     * The arrival floor, restated independently: a chord is heard AS A
     * CHORD when it arrives, so an arrival statement borrowed from a thin
     * slot (top-voice, guide-tones) widens to the package's three-voice
     * statement. Thin voicings decorate between arrivals only.
     */
    return slot.voicing === "top-voice" || slot.voicing === "guide-tones"
      ? "upper-voices"
      : slot.voicing;
  }
  return null;
}

/**
 * The measured comp voice count, written here as a literal rather than
 * imported: the style statistics count the comping instrument's simultaneous
 * notes as 3:559, 4:208, 2:27, 5:6, so three is what a comp states. `the
 * register policy publishes exactly the numbers this file assumes` asserts the
 * production export agrees with this literal.
 */
const TARGET_COMP_VOICES = 3;

/**
 * The voices a comp sounds, re-implemented from the contract: `all` keeps the
 * written voicing, `upper-voices` keeps the TOP `TARGET_COMP_VOICES` and drops
 * from the bottom, because a bass slot is already sounding those pitch classes
 * two octaves down. Written as a `filter` over indices rather than the
 * production `slice`, so it is a second implementation of the rule and not a
 * copy of it.
 */
function compVoicesOf(
  midiPitches: readonly number[],
  voicing: PerformanceCompVoicing,
): readonly number[] {
  const ascending = [...midiPitches].sort((left, right) => left - right);
  if (voicing === "all") return ascending;
  /* The thin voicings (measured campaign, 2026-07-31) keep the TOP one or
     two voices; upper-voices keeps the package target of three. */
  const keep =
    voicing === "top-voice" ? 1 : voicing === "guide-tones" ? 2 : TARGET_COMP_VOICES;
  const dropped = Math.max(0, ascending.length - keep);
  return ascending.filter((_unused, index) => index >= dropped);
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
const SEPARATION_SEMITONES = 4;
const MAX_COMP_SPAN_SEMITONES = 19;
const MIN_COMP_WIDTH_VOICES = 3;

/**
 * `placeCompInRegister`, re-derived from the contract text:
 *
 *  1. WIDTH — while the voicing spans more than a nineteenth and has more than
 *     three voices, drop its lowest voice.
 *  2. REGISTER — octave-transpose the whole voicing so its lowest voice lands
 *     inside `[lowMidi, lowMidi + 23]`; the home octave and the lift above it
 *     are the only two placements that can qualify.
 *  3. SEPARATION, CEILING and VOICE LEADING — a placement is ADMISSIBLE when
 *     its bottom clears the sounding bass by `SEPARATION_SEMITONES` and its top
 *     is at or under `ceilingMidi`. Of the admissible placements, take the one
 *     whose bottom is NEAREST the previous comp's bottom, ties DOWN. If neither
 *     is admissible, drop the lowest voice and start the search again.
 *
 * The nearest-to-previous rule replaced a plain "home octave, else the lift"
 * normalization, because normalization WRAPS: two chords a semitone apart
 * across the home octave's boundary were placed eleven semitones apart and the
 * comping hand leapt an octave for no musical reason. `leadFrom` is the bottom
 * voice of the comp that sounded most recently, or `lowMidi` for the first comp
 * of a plan — below every admissible bottom, so the home octave always wins
 * there.
 *
 * Deliberately written with plain floating `Math.ceil` and array slicing — a
 * second, differently shaped implementation of the same arithmetic the
 * compiler does with integer floor division.
 */
function independentlyPlacedComp(
  voices: readonly number[],
  bassMidi: number | null,
  register: PerformanceCompRegister,
  previousCompBottom: number | null,
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
  const leadFrom = previousCompBottom ?? register.lowMidi;
  for (let guard = 0; guard <= voices.length; guard += 1) {
    const low = work[0] ?? 0;
    const high = work[work.length - 1] ?? 0;
    const home = Math.ceil((register.lowMidi - low) / 12);
    const admissible = [home, home + 1].filter(
      (shift) =>
        low + 12 * shift >= floor &&
        high + 12 * shift <= register.ceilingMidi,
    );
    if (admissible.length > 0) {
      const chosen = admissible.reduce((best, shift) =>
        Math.abs(low + 12 * shift - leadFrom) <
        Math.abs(low + 12 * best - leadFrom)
          ? shift
          : best,
      );
      return work.map((midi) => midi + 12 * chosen);
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
 * The bottom voice of the comp that sounded most recently STRICTLY BEFORE a
 * tick, which is what the register placement is led from. Null when no comp
 * has attacked yet, in which case the placement leads from `lowMidi`.
 */
function compBottomBefore(plan: PlaybackPlan, tick: number): number | null {
  let bottom: number | null = null;
  for (const event of plan.events) {
    if (Number(event.startTick) >= tick) break;
    if (roleOf(event.eventId) !== "comp") continue;
    bottom = Math.min(...[...event.midiPitches].map((midi) => Number(midi)));
  }
  return bottom;
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
  test("the memoized fixture is a fixture, not a shortcut: rebuilding agrees", () => {
    /*
     * The guard on `deaconBluesLiteralPlan`'s cache. Every rhythm expectation
     * in this file is measured against one shared literal plan, so if that
     * plan were not reproducible the whole file would be pinning an accident.
     * This builds a SECOND one from scratch, under a different document id,
     * and requires the two to agree in everything but that id.
     */
    const cached = deaconBluesLiteralPlan();
    const rebuilt = buildDeaconBluesLiteralPlan(
      "document-performance-deacon-blues-rebuild",
    );
    expect(rebuilt).not.toBe(cached);
    const withoutId = (plan: PlaybackPlan): string =>
      JSON.stringify(plan).replaceAll(
        /document-performance-deacon-blues(-rebuild)?/gu,
        "document",
      );
    expect(withoutId(rebuilt)).toBe(withoutId(cached));
    expect(Object.isFrozen(cached)).toBe(true);
    expect(Object.isFrozen(cached.events)).toBe(true);
  });

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

  test("every bass event sounds one pitch in 28..48 that the chord contains", () => {
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
    expect(bassEvents).toBe(23);
    /*
     * And the measured window is genuinely USED, not merely respected: the line
     * reaches BOTH ENDS of it exactly, so it spans the whole twenty-one
     * semitones over six bars.
     *
     * Two rules put it there and neither alone can. The ANCHOR decides where
     * the line sits, because it is where the first bass note is placed from and
     * every later note is placed from that one; anchoring in the middle of the
     * window collapsed the measured interquartile range to 4. The
     * `register-floor` PLACEMENT on the open bar's downbeat is what reaches the
     * floor: a rule that always minimizes motion can never make the gesture
     * that drops to the bottom of an instrument, and while `nearest` was the
     * only placement this line bottomed out at 33 — five semitones above the
     * reference's own measured minimum of 28.
     */
    const line = performance.events
      .filter((event) => roleOf(event.eventId) === "bass")
      .map((event) => Number(event.midiPitches[0]));
    expect(Math.max(...line)).toBe(PERFORMANCE_BASS_REGISTER.highMidi);
    expect(Math.min(...line)).toBe(PERFORMANCE_BASS_REGISTER.lowMidi);
    expect(Math.max(...line) - Math.min(...line)).toBe(20);
    expect(PERFORMANCE_BASS_REGISTER).toEqual({
      lowMidi: 28,
      highMidi: 48,
      anchorMidi: 45,
    });
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
     * The register spans 21 semitones, so an octave leap is 12 and a bound of
     * 11 is strictly inside it. Every step this line takes is smaller than an
     * octave: the `nearest` placement takes the closest octave of the chord
     * tone it is given, and the ONE `register-floor` slot takes the lowest —
     * which is a deliberate PHRASE GESTURE and still lands inside an octave of
     * where the line was, because the line is above the floor rather than an
     * octave above it. A rule that permitted an octave leap could not tell that
     * gesture apart from the register wander this placement law exists to
     * remove, so the bound stays under 12.
     *
     * 11 is not a fitted number either way: it is `12 - 1`, the largest step
     * that is still not an octave.
     */
    expect(widest).toBe(11);
    expect(widest).toBeLessThan(12);
  });

  test("every bass note is either LED to the nearest octave or DROPPED to the floor", () => {
    /*
     * The two placement rules, re-derived from the register window rather than
     * read off the table, and asserted to be the ONLY two things that decide a
     * bass note's octave.
     *
     * For each emitted bass note: collect every placement of its own pitch
     * class inside `[lowMidi, highMidi]`. The note must be either the one
     * NEAREST the previous bass note (ties down — the `nearest` placement) or
     * the LOWEST of them (the `register-floor` placement). Nothing else is
     * legal, and both must actually occur or one of the two rules is dead.
     *
     * WHY THE SECOND RULE EXISTS. `nearest` minimizes motion by definition, so
     * it can never make a gesture that reaches the bottom of an instrument;
     * with it as the only rule this line bottomed out at MIDI 33 against the
     * reference's measured minimum of 28, and its median sat four semitones
     * high. Declaring the OPEN BAR'S DOWNBEAT `register-floor` reproduces the
     * measured minimum and maximum exactly and brings the line's motion to 2.73
     * semitones mean and 6.8 p90 against the measured 2.92 and 7.
     */
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    const classesOf = new Map<string, ReadonlySet<number>>();
    for (const event of literal.events) {
      classesOf.set(
        String(event.eventId),
        new Set(
          [...event.midiPitches].map((midi) => ((Number(midi) % 12) + 12) % 12),
        ),
      );
    }
    const illegal: string[] = [];
    let led = 0;
    let dropped = 0;
    let previous: number | null = null;
    for (const event of performance.events) {
      if (roleOf(event.eventId) !== "bass") continue;
      const midi = Number(event.midiPitches[0]);
      const classes = classesOf.get(sourceIdOf(event.eventId));
      if (classes === undefined) throw new Error("PLACEMENT_SOURCE");
      /*
       * Every placement of THIS note's own pitch class inside the window,
       * enumerated over the window's whole width rather than by stepping the
       * bounds, so the search cannot depend on the constants being ordered.
       */
      const width: number =
        PERFORMANCE_BASS_REGISTER.highMidi - PERFORMANCE_BASS_REGISTER.lowMidi;
      const placements: number[] = [];
      for (let step = 0; step <= width; step += 1) {
        const candidate = PERFORMANCE_BASS_REGISTER.lowMidi + step;
        if (((candidate % 12) + 12) % 12 === ((midi % 12) + 12) % 12) {
          placements.push(candidate);
        }
      }
      expect(placements).toContain(midi);
      /* And the class is one the WRITTEN chord actually sounds. */
      expect(classes.has(((midi % 12) + 12) % 12)).toBe(true);
      const target: number = previous ?? PERFORMANCE_BASS_REGISTER.anchorMidi;
      const nearest: number = placements.reduce(
        (best: number, candidate: number): number =>
          Math.abs(candidate - target) < Math.abs(best - target)
            ? candidate
            : best,
      );
      const floor = Math.min(...placements);
      if (midi === nearest) led += 1;
      else if (midi === floor) dropped += 1;
      else {
        illegal.push(`${String(event.eventId)}:${String(midi)}`);
      }
      previous = midi;
    }
    expect(illegal).toEqual([]);
    /*
     * Both rules are live. Three of the six bars are open bars and each one's
     * downbeat takes the floor placement, but only ONE of the three lands
     * somewhere `nearest` would not have: for the other two the chord tone has
     * a single placement inside the window, or its lowest one is already the
     * nearest, so the two rules agree there and the note counts as led. One
     * unambiguous drop is enough to prove the rule is not dead — and it is the
     * note that reaches the measured floor.
     */
    expect(dropped).toBe(1);
    expect(led).toBeGreaterThan(dropped);
    expect(led + dropped).toBe(23);
    /* And the drop is what reaches the measured floor. */
    const line = performance.events
      .filter((event) => roleOf(event.eventId) === "bass")
      .map((event) => Number(event.midiPitches[0]));
    expect(Math.min(...line)).toBe(PERFORMANCE_BASS_REGISTER.lowMidi);
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
     * Forty-seven. The comp is a quarter-note grid — four to a bar in every
     * phase, 24 over six bars — and the bass is the measured syncopation: in
     * the busy bar the downbeat, the and-of-1, the and-of-2, beat 3 and the
     * and-of-4; in the open bar the held downbeat and the and-of-4, plus one
     * arrival note per chord that begins where no bass slot lands. 23 bass and
     * 24 comp.
     */
    expect(performance.events.length).toBe(47);
    expect(performance.events.length).toBeGreaterThan(literal.events.length);

    const offBeat = performance.events.filter(
      (event) => event.startTick % TICKS_PER_BEAT !== 0,
    );
    /*
     * Twelve of the forty-seven are off the beat, and every one of them is a
     * BASS note: the and-of-1 and the and-of-2 in the three busy bars, and the
     * and-of-4 in all six. Nothing is displaced from where it is written —
     * this style declares STRAIGHT eighths, because 671 of the reference
     * bass's 681 onsets and 2 572 of its comping instrument's 2 584 fall
     * exactly on the eighth-note grid. The comping grid is dead on the
     * quarter, which is what the measured onset histogram says
     * (629/650/630/618 at eighth positions 0, 2, 4 and 6, and 57 across all
     * four positions between them).
     */
    expect(offBeat.length).toBe(12);
    expect(
      new Set(offBeat.map((event) => event.startTick % TICKS_PER_BAR)),
    ).toEqual(new Set([480, 1440, 3360]));
    expect(offBeat.every((event) => roleOf(event.eventId) === "bass")).toBe(
      true,
    );
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
    /*
     * Five bass notes in a phase-0 bar (the downbeat, the and-of-1, the
     * and-of-2, beat 3 and the and-of-4 — the four measured positions plus the
     * eighth-pair partner), and three in a phase-1 one (the held downbeat, the
     * mid-bar chord's arrival, and the and-of-4). Bar 6 has two: it is a
     * phase-1 bar with a single chord, so there is no arrival to add and the
     * downbeat simply holds.
     *
     * That is the measured BREATHING, and it is the point of the two-bar
     * cycle: 3.83 attacks a bar against the reference's 3.23, and a per-bar
     * density that varies where a metronomic table's does not.
     */
    expect(
      Array.from({ length: barCount }, (_unused, bar) =>
        eventsInBar(performance, bar, "bass").length,
      ),
    ).toEqual([5, 3, 5, 3, 5, 2]);

    /*
     * The comp is the measured quarter-note grid: four to a bar, every bar,
     * both phases. What breathes is the RELEASE, not a missing stab.
     */
    expect(
      Array.from({ length: barCount }, (_unused, bar) =>
        eventsInBar(performance, bar, "comp").length,
      ),
    ).toEqual([4, 4, 4, 4, 4, 4]);

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
    /*
     * The measured figure: the downbeat (0), its eighth-pair partner the
     * and-of-1 (480), the and-of-2 (1440), beat 3 (1920 — which is also the
     * second chord's own arrival) and the and-of-4 (3360). Beat 1 carries 27 %
     * of the reference's bass onsets, the largest share of any position in the
     * bar, so it is a declared slot and not only an arrival.
     */
    expect(firstBar.map((event) => Number(event.startTick))).toEqual([
      0, 480, 1440, 1920, 3360,
    ]);
    /* And EVERY chord's arrival note sounds that chord's own written root. */
    const writtenRootOf = (pitches: readonly number[]): number =>
      ((Math.min(...pitches) % 12) + 12) % 12;
    const mismatched: string[] = [];
    for (const chord of literal.events) {
      const arrival = performance.events.find(
        (event) =>
          roleOf(event.eventId) === "bass" &&
          Number(event.startTick) === Number(chord.startTick),
      );
      const sounded =
        arrival === undefined
          ? null
          : ((Number(arrival.midiPitches[0]) % 12) + 12) % 12;
      if (sounded !== writtenRootOf([...chord.midiPitches].map(Number))) {
        mismatched.push(`${String(chord.eventId)}:${String(sounded)}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  test("the bass is detached and syncopated, not a pair of held halves", () => {
    const performance = performed(deaconBluesLiteralPlan());
    /*
     * Bar 5 is one whole-bar chord in a phase-0 bar, so nothing truncates the
     * measured pattern and the whole of it is visible at once: the downbeat
     * root, the and-of-1 at 480, the and-of-2 at 1440, beat 3 at 1920 and the
     * and-of-4 at 3360.
     *
     * The short length is the reference's own length MEDIAN, reproduced exactly
     * once P0's articulation formula has taken its 24-tick release gap off the
     * gate: a declared 19/40 of a beat (456 ticks) SOUNDS 432, which is 0.45
     * beats. The half-bar note declares 3/2 (1440), which would end exactly on
     * the and-of-4's attack, so the CLIPPING law releases it
     * `PERFORMANCE_RELEASE_GAP_TICKS` early at 1410 and it sounds 1386.
     *
     * That length was 11/8 — sounding 1296, which is 1.35 beats and the
     * measurement's second length MODE — and 3/2 measured better on the
     * statistic that counts every bar rather than one bucket: the bass sounding
     * fraction is 0.884 against the reference's 0.893 where 11/8 left it at
     * 0.873.
     */
    const bar5 = eventsInBar(performance, 4, "bass");
    expect(
      bar5.map((event) => [
        Number(event.startTick) - 4 * TICKS_PER_BAR,
        Number(event.durationTicks),
      ]),
    ).toEqual([
      [0, 450],
      [480, 456],
      [1440, 450],
      [1920, 1410],
      [3360, 450],
    ]);
    /* The declared lengths, and what each one actually sounds. */
    expect((19 * TICKS_PER_BEAT) / 40).toBe(456);
    expect((3 * TICKS_PER_BEAT) / 2).toBe(1440);
    expect(Number(bar5[1]?.gateDurationTicks)).toBe(432);
    /* Declared 1440, clipped by the release gap to 1410, gated to 1386. */
    expect(1440 - PERFORMANCE_RELEASE_GAP_TICKS).toBe(1410);
    expect(Number(bar5[3]?.gateDurationTicks)).toBe(
      1410 - PLAYBACK_RELEASE_GAP_TICKS,
    );
    /*
     * Bar 6 is a phase-1 bar with one chord: the OPEN bar, which is where the
     * measured length p90 of 3.14 beats and the 12 % of inter-onset intervals
     * longer than two beats come from. The root is struck once and held to the
     * and-of-4, and nothing else happens at all.
     */
    const bar6 = eventsInBar(performance, 5, "bass");
    expect(
      bar6.map((event) => [
        Number(event.startTick) - 5 * TICKS_PER_BAR,
        Number(event.durationTicks),
      ]),
    ).toEqual([
      [0, 3330],
      [3360, 450],
    ]);
    /*
     * 3330 rather than the declared 3360 is the release gap, stated as
     * arithmetic: the held root is clipped to the next attack of its own role
     * less the gap, so even the longest note in the style clears before the
     * next one speaks. The and-of-4 is clipped the same way against the end of
     * the music.
     */
    const held = bar6[0];
    const tail = bar6[1];
    if (held === undefined || tail === undefined) {
      throw new Error("PERFORMANCE_TEST_TAIL");
    }
    expect(Number(held.startTick) + Number(held.durationTicks)).toBe(
      Number(tail.startTick) - PERFORMANCE_RELEASE_GAP_TICKS,
    );
    expect(Number(tail.startTick) + Number(tail.durationTicks)).toBe(
      performance.totalTicks - PERFORMANCE_RELEASE_GAP_TICKS,
    );
    expect((7 * TICKS_PER_BEAT) / 2).toBe(3360);
  });

  test("the comp is a quarter-note grid that releases, and never two at once", () => {
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);

    for (let bar = 0; bar < 6; bar += 1) {
      const comps = eventsInBar(performance, bar, "comp");
      /*
       * The measured onset histogram puts a comp on all four quarters of
       * essentially every bar (629/650/630/618), so the table declares all
       * four in both phases and this bound is an equality, not a ceiling.
       * Emptying one of the four in the open bar was measured and made every
       * attack-rate, rest and onset dimension it touched worse.
       */
      expect(comps.length).toBe(4);
      const attackBeats = comps.map((event) =>
        Math.floor((event.startTick - bar * TICKS_PER_BAR) / TICKS_PER_BEAT),
      );
      expect(attackBeats).toEqual([0, 1, 2, 3]);
      /* Dead on the quarter: nothing in the comping voice is displaced. */
      for (const event of comps) {
        expect(event.startTick % TICKS_PER_BEAT).toBe(0);
      }
      /*
       * And what makes it a player rather than a machine gun is the RELEASE
       * and the velocity, not a missing stab: every comp clears a fifth of a
       * beat before the next quarter, and no two of the four are struck alike.
       *
       * The LENGTH is one length, and that is measured rather than chosen: 95 %
       * of the reference's comping notes last exactly 0.80 beats and its p10,
       * median and p90 are all 0.80. A declared 33/40 of a beat is 792 ticks,
       * and P0's own articulation formula takes its 24-tick release gap off
       * that to sound exactly 768 — 0.800 beats. A four-different-lengths
       * contour was tried and measured worse on the very quantiles it was
       * meant to serve.
       */
      for (const event of comps) {
        expect(Number(event.durationTicks)).toBe((33 * TICKS_PER_BEAT) / 40);
        expect(event.durationTicks).toBeLessThan(TICKS_PER_BEAT);
        expect(Number(event.gateDurationTicks)).toBe((4 * TICKS_PER_BEAT) / 5);
      }
      expect(new Set(comps.map((event) => event.durationTicks)).size).toBe(1);
      expect(new Set(comps.map((event) => event.velocity)).size).toBe(4);
    }

    /*
     * And comps never stack: two voicings sounding at once would be two
     * different chords played simultaneously, which is the audible form of the
     * arrival bug's opposite failure.
     */
    const comps = performance.events.filter(
      (event) => roleOf(event.eventId) === "comp",
    );
    expect(comps.length).toBe(24);
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
    expect(loudest(1)).toBe(85);
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
    /*
     * A real player is not a single velocity, nor two. Nine distinct slot
     * levels across a two-bar cycle — five bass and four comp — become
     * thirteen once the phase-1 ease of 5 is applied and the slots that sound
     * in only one phase are counted once. On a quarter-note comping grid this
     * is the difference between a band and a machine gun.
     */
    expect(velocities.size).toBe(13);
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
    /* Every comp, stated arrival included, sits under the loudest bass. */
    expect(loudestComp).toBe(90);
    expect(loudestComp).toBeLessThan(loudestBass);
  });
});

/* ------------------------------------------------------------------ */
/* The measured style laws: length, width, release, register.           */
/* ------------------------------------------------------------------ */

/** Every emitted event's role, tick, length and pitches, in emission order. */
type Sounded = Readonly<{
  eventId: string;
  role: EmittedRole;
  startTick: number;
  durationTicks: number;
  endTick: number;
  velocity: number;
  pitches: readonly number[];
}>;

function soundedEvents(performance: PlaybackPlan): readonly Sounded[] {
  const sounded: Sounded[] = [];
  for (const event of performance.events) {
    const role = roleOf(event.eventId);
    if (role === null) throw new Error(`LAW_ROLE:${String(event.eventId)}`);
    sounded.push(
      Object.freeze({
        eventId: String(event.eventId),
        role,
        startTick: Number(event.startTick),
        durationTicks: Number(event.durationTicks),
        endTick: Number(event.startTick) + Number(event.durationTicks),
        velocity: event.velocity,
        pitches: Object.freeze(
          [...event.midiPitches].map(Number).sort((left, right) => left - right),
        ),
      }),
    );
  }
  return Object.freeze(sounded);
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) throw new Error("LAW_MEDIAN_EMPTY");
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * The laws the measured tuning is FOR. Each one is a bound the ballad table
 * must satisfy for any chart, re-derived from the emitted plan and never read
 * back out of the table it is meant to check. The chart under them is the
 * seeded one, plus a whole-bar and a two-chord fixture so that no bound is
 * proved only where the chart happens to be convenient.
 */
describe("the measured ballad style laws", () => {
  const ballad = PERFORMANCE_STYLES["ballad-comp@1"];

  /*
   * MEMOIZED for the same reason the seeded plan is: each of these publishes a
   * chart through T0, F2, F3 and the V2 optimizer, they are deeply frozen, and
   * eight laws below read all three.
   */
  let fixtureCache: readonly Readonly<{
    name: string;
    literal: PlaybackPlan;
  }>[] | null = null;

  const buildFixtures = (): readonly Readonly<{
    name: string;
    literal: PlaybackPlan;
  }>[] =>
    Object.freeze([
      Object.freeze({
        name: "deacon-blues",
        literal: deaconBluesLiteralPlan(),
      }),
      Object.freeze({
        name: "whole-bars",
        literal: literalPlanOf(
          publishChart(
            "| Cmaj7 | Fmaj7 | Bbmaj7 | Ebmaj7 |",
            meterOf(4, 4),
            "document-performance-law-whole-bars",
          ),
        ),
      }),
      Object.freeze({
        name: "two-per-bar",
        literal: literalPlanOf(
          publishChart(
            "| Dm7 G7 | Cmaj7 A7 | Dm7 G7 | Cmaj7 |",
            meterOf(4, 4),
            "document-performance-law-two-per-bar",
          ),
        ),
      }),
    ]);

  const fixtures = (): readonly Readonly<{
    name: string;
    literal: PlaybackPlan;
  }>[] => {
    fixtureCache ??= buildFixtures();
    return fixtureCache;
  };

  test("no comp event is longer than one beat", () => {
    /*
     * The measured comp length is a median of 0.80 beats and a mean of 0.84 on
     * a quarter-note grid, so a comp that reaches a whole beat has stopped
     * being a comp and started being the pad this tuning replaced. The bound
     * is the beat itself; the table's longest declaration is 0.9 of one.
     */
    const tooLong: string[] = [];
    const lengths: number[] = [];
    for (const fixture of fixtures()) {
      for (const event of soundedEvents(performed(fixture.literal))) {
        if (event.role !== "comp") continue;
        lengths.push(event.durationTicks);
        if (event.durationTicks >= TICKS_PER_BEAT) {
          tooLong.push(`${fixture.name}/${event.eventId}:${String(event.durationTicks)}`);
        }
      }
    }
    expect(tooLong).toEqual([]);
    /*
     * One length, and it is the measurement's: 95 % of the reference's comping
     * notes last exactly 0.80 beats and its p10, median and p90 are all 0.80.
     * The DECLARED length is 33/40 of a beat — 792 ticks — and P0's own
     * articulation formula takes its 24-tick release gap off that, so what
     * SOUNDS is 768 ticks, which is 0.800 beats exactly. The declared value is
     * what this law sees; the sounding value is what the measurement names.
     */
    expect(Math.max(...lengths)).toBe(792);
    expect(medianOf(lengths) / TICKS_PER_BEAT).toBe(0.825);
    expect((792 - PLAYBACK_RELEASE_GAP_TICKS) / TICKS_PER_BEAT).toBe(0.8);
  });

  test("no bass event outlives its own bar, and the median stays detached", () => {
    /*
     * The measured bass is median 0.45 beats against a mean of 1.11 and a p90
     * of 3.14: mostly detached, with a real tail of HELD notes. An earlier
     * version of this law bounded every bass note at two beats, and the
     * measurement contradicts it — the reference's longest bass note is 3.60
     * beats (3456 ticks at PPQ 960) and a tenth of its notes are longer than
     * three. The tail is not a drone; it is the open bar, and it is the shape
     * the two-bar cycle exists to produce.
     *
     * So the bound re-derived from the measurement is the BAR, less the
     * release gap: a bass note may hold a whole bar and must still clear
     * before the next one speaks. The median stays under half a beat, which is
     * the detachment the measurement actually names.
     */
    const tooLong: string[] = [];
    const lengths: number[] = [];
    for (const fixture of fixtures()) {
      for (const event of soundedEvents(performed(fixture.literal))) {
        if (event.role !== "bass") continue;
        lengths.push(event.durationTicks);
        if (
          event.durationTicks >
          TICKS_PER_BAR - PERFORMANCE_RELEASE_GAP_TICKS
        ) {
          tooLong.push(`${fixture.name}/${event.eventId}:${String(event.durationTicks)}`);
        }
      }
    }
    expect(tooLong).toEqual([]);
    expect(Math.max(...lengths)).toBe(3330);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(3 * TICKS_PER_BEAT + 480);
    /* Detached, measurably: the median is under half a beat. */
    expect(medianOf(lengths)).toBe(450);
    expect(medianOf(lengths)).toBeLessThanOrEqual(TICKS_PER_BEAT / 2);
  });

  test("comps state the written voicing, and the rules thin it", () => {
    /*
     * 3:70 %, 4:26 %, 2:3 % — the measured simultaneous-note counts of the
     * comping instrument, and the law that reproduces them is NOT the one this
     * test used to state.
     *
     * The old table pre-selected three voices on three of its four slots
     * (`upper-voices`, keeping the top `PERFORMANCE_COMP_TARGET_VOICES`) and
     * declared `all` on the beat-4 lift alone. Measured against the reference
     * that produced 8 % four-note comps against 26 %, and it made the lift the
     * one slot in the bar with a different bottom voice — so the comping hand's
     * bottom leapt seven to nine semitones every fourth beat and back again.
     *
     * Every ballad slot now declares `all`: the comp states the WRITTEN VOICING
     * and only the WIDTH and CEILING rules take anything off it, from the
     * bottom, and only where the chord is genuinely two registers wide or would
     * break the ceiling. That measures 58 % three-note against 42 % four-note
     * (histogram divergence 0.157 against the old 0.184) and drops the comp's
     * bottom-voice motion p90 from 4.8 semitones to 3.0.
     *
     * `PERFORMANCE_COMP_TARGET_VOICES` is still a live rule: medium-swing@1's
     * Charleston stabs declare `upper-voices`, and this file's fixtures cover
     * both styles.
     */
    const wide: string[] = [];
    const counts = new Map<number, number>();
    for (const fixture of fixtures()) {
      for (const event of soundedEvents(performed(fixture.literal))) {
        if (event.role !== "comp") continue;
        counts.set(
          event.pitches.length,
          (counts.get(event.pitches.length) ?? 0) + 1,
        );
        /*
         * Nothing ADDS a voice anywhere in this package, so no comp can ever
         * state more than the four the Auto policy wrote.
         */
        if (event.pitches.length > TARGET_COMP_VOICES + 1) {
          wide.push(`${fixture.name}/${event.eventId}:${String(event.pitches.length)}`);
        }
      }
    }
    expect(wide).toEqual([]);
    /*
     * Three remains the mode, as the measurement says it should be, and the
     * REGISTER laws are what produce anything thinner: a written voicing whose
     * top would exceed the comping ceiling loses its lowest voice, so some
     * comps state two — the reference's own comping instrument states two 3 %
     * of the time, so this is inside the style rather than outside it, and the
     * trade it buys is pinned in "the ceiling thins a comp rather than break
     * itself".
     */
    expect([...counts.keys()].sort((left, right) => left - right)).toEqual([
      2, 3, 4,
    ]);
    expect(counts.get(3) ?? 0).toBeGreaterThan(counts.get(2) ?? 0);
    expect(counts.get(3) ?? 0).toBeGreaterThan(counts.get(4) ?? 0);
    /*
     * And the seeded chart's comps now reach four voices on EVERY beat of the
     * bar rather than only on the lift, which is the whole point of the change:
     * the bottom voice of a comp no longer depends on which slot it came from.
     */
    const seeded = soundedEvents(performed(deaconBluesLiteralPlan())).filter(
      (event) => event.role === "comp",
    );
    expect(seeded.length).toBe(24);
    expect(
      [...new Set(seeded.map((event) => event.pitches.length))].sort(
        (left, right) => left - right,
      ),
    ).toEqual([3, 4]);
    const fourVoiceBeats = new Set(
      seeded
        .filter((event) => event.pitches.length === 4)
        .map((event) => event.startTick % TICKS_PER_BAR),
    );
    expect(fourVoiceBeats.size).toBeGreaterThan(1);
    for (const offset of fourVoiceBeats) {
      /* Still only ever on the quarter-note grid the table declares. */
      expect(offset % TICKS_PER_BEAT).toBe(0);
    }
  });

  test("every note releases before the next attack of its own role", () => {
    /*
     * THE RELEASE IS THE POINT, stated as a strict inequality. The old tuning
     * satisfied "does not overlap" — an event ended exactly where the next one
     * began — and that is what smearing sounds like. A gap of zero fails here.
     */
    for (const fixture of fixtures()) {
      const performance = performed(fixture.literal);
      const gaps: number[] = [];
      const butted: string[] = [];
      for (const role of ["bass", "comp"] as const) {
        const inRole = soundedEvents(performance).filter(
          (event) => event.role === role,
        );
        for (let index = 1; index < inRole.length; index += 1) {
          const previous = inRole[index - 1];
          const current = inRole[index];
          if (previous === undefined || current === undefined) {
            throw new Error("LAW_RELEASE_ORDER");
          }
          const gap = current.startTick - previous.endTick;
          gaps.push(gap);
          if (gap <= 0) {
            butted.push(`${fixture.name}/${previous.eventId}->${current.eventId}:${String(gap)}`);
          }
        }
      }
      expect(butted).toEqual([]);
      /*
       * And the smallest of them is the structural floor the clipping law
       * guarantees wherever it shortens a slot, not an accident of the table.
       */
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(
        PERFORMANCE_RELEASE_GAP_TICKS,
      );
    }
    /* The last note of the plan clears the end of the music too. */
    const performance = performed(deaconBluesLiteralPlan());
    const last = soundedEvents(performance).reduce((left, right) =>
      right.endTick > left.endTick ? right : left,
    );
    expect(performance.totalTicks - last.endTick).toBe(
      PERFORMANCE_RELEASE_GAP_TICKS,
    );
  });

  test("no role ever fills a bar, and the shares are the measured ones", () => {
    /*
     * The numeric proof of the release property, and the one number that says
     * the defect is gone. The literal plan is the control: P0 sustains every
     * chord for its whole written duration, so its bars are 100 % sounding.
     *
     * The bounds are the reference's own per-bar sounding fractions rather
     * than a round number. Measured over its 208 four-four bars: the comping
     * instrument sounds for a median of 0.800 of a bar and never more than
     * 0.898; the bass for a median of 0.900 and never more than 0.975. NEITHER
     * ever reaches 1.000, and that — not a fixed 85 % cap — is the law. An
     * earlier version capped every role at 85 % of every bar, which the
     * measurement contradicts for the bass: a held root through an open bar is
     * the reference's own p90 note length, not a pad.
     */
    const literal = deaconBluesLiteralPlan();
    const performance = performed(literal);
    const barCount = performance.totalTicks / TICKS_PER_BAR;
    expect(barCount).toBe(6);

    const soundingIn = (
      plan: PlaybackPlan,
      bar: number,
      role: EmittedRole | null,
    ): number => {
      const start = bar * TICKS_PER_BAR;
      const end = start + TICKS_PER_BAR;
      let ticks = 0;
      for (const event of plan.events) {
        if (role !== null && roleOf(event.eventId) !== role) continue;
        const from = Math.max(start, Number(event.startTick));
        const to = Math.min(end, Number(event.startTick) + Number(event.durationTicks));
        if (to > from) ticks += to - from;
      }
      return ticks;
    };

    /* The control: the chart as P0 compiles it never stops sounding. */
    for (let bar = 0; bar < barCount; bar += 1) {
      expect(soundingIn(literal, bar, null)).toBe(TICKS_PER_BAR);
    }

    const compShare: number[] = [];
    const bassShare: number[] = [];
    for (let bar = 0; bar < barCount; bar += 1) {
      compShare.push(soundingIn(performance, bar, "comp"));
      bassShare.push(soundingIn(performance, bar, "bass"));
    }
    expect(compShare).toEqual([3168, 3168, 3168, 3168, 3168, 3168]);
    expect(bassShare).toEqual([3216, 3750, 3216, 3750, 3216, 3780]);
    for (let bar = 0; bar < barCount; bar += 1) {
      /* No role EVER fills a bar — the property the reference also has. */
      expect(compShare[bar] ?? 0).toBeLessThan(TICKS_PER_BAR);
      expect(bassShare[bar] ?? 0).toBeLessThan(TICKS_PER_BAR);
      /* The comp sits inside the reference's own per-bar band. */
      expect((compShare[bar] ?? 0) / TICKS_PER_BAR).toBeLessThanOrEqual(0.898);
      expect((compShare[bar] ?? 0) / TICKS_PER_BAR).toBeGreaterThanOrEqual(0.8);
    }
    /*
     * Over the whole chart: 0.825 for the comp against the reference's 0.793,
     * and 0.905 for the bass against its 0.893. The comp's excess is one
     * release gap per quarter and no more, which is what a 33/40-beat length
     * on a quarter-note grid costs. The bass's is the half-bar note declaring
     * 3/2 and being clipped a release gap short of the anticipation rather than
     * stopping a fortieth of a beat earlier still; measured against the gates
     * the engine actually holds, the bass sounds 0.884 of the bar against the
     * reference's 0.893, which is closer than the 0.873 the shorter length gave.
     */
    const total = compShare.reduce((left, right) => left + right, 0);
    expect(total / (barCount * TICKS_PER_BAR)).toBeCloseTo(0.825, 10);
    const bassTotal = bassShare.reduce((left, right) => left + right, 0);
    expect(bassTotal / (barCount * TICKS_PER_BAR)).toBeCloseTo(0.908, 3);
  });

  test("every bass pitch sits inside the measured 28..48 window", () => {
    const outside: string[] = [];
    for (const fixture of fixtures()) {
      for (const event of soundedEvents(performed(fixture.literal))) {
        if (event.role !== "bass") continue;
        expect(event.pitches.length).toBe(1);
        const midi = event.pitches[0] ?? -1;
        if (midi < 28 || midi > 48) {
          outside.push(`${fixture.name}/${event.eventId}:${String(midi)}`);
        }
      }
    }
    expect(outside).toEqual([]);
    expect(PERFORMANCE_BASS_REGISTER.lowMidi).toBe(28);
    expect(PERFORMANCE_BASS_REGISTER.highMidi).toBe(48);
  });

  test("every comp clears every bass note under it by a major third", () => {
    /*
     * The separation law under the new register, asked the strong way: not
     * only of the bass note attacking under the comp's own onset, but of every
     * bass note that sounds at any point while the comp is still ringing.
     *
     * THE LAW USED TO SAY MINOR NINTH AND THE MEASUREMENT CONTRADICTED IT. The
     * reference's comping instrument puts its lowest note THREE SEMITONES BELOW
     * its bass part's highest, and its comping range bottoms out five semitones
     * under where a minor-ninth floor can reach; the floor, not the register
     * window, was deciding where our comping hand sat. It is deliberately
     * relaxed to a MAJOR THIRD — the largest floor that stops being the binding
     * constraint, chosen off a measured plateau where 2, 3 and 4 all score the
     * same and 5 starts costing — so the rule now forbids only what actually
     * muds a low register: unison, second, minor third, and crossing under.
     */
    const crowded: string[] = [];
    for (const fixture of fixtures()) {
      const events = soundedEvents(performed(fixture.literal));
      for (const comp of events) {
        if (comp.role !== "comp") continue;
        const lowest = comp.pitches[0] ?? 0;
        for (const bass of events) {
          if (bass.role !== "bass") continue;
          if (bass.startTick >= comp.endTick) break;
          if (bass.endTick <= comp.startTick) continue;
          const separation = lowest - (bass.pitches[0] ?? 0);
          if (separation < SEPARATION_SEMITONES) {
            crowded.push(`${fixture.name}/${comp.eventId}:${String(separation)}`);
          }
        }
      }
    }
    expect(crowded).toEqual([]);
    expect(PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES).toBe(4);
  });

  test("the table itself declares the measured shape, slot for slot", () => {
    /*
     * The one place the table is read directly, and it is read as the
     * MEASUREMENT rather than as itself: a comp on every quarter in every
     * phase, a bass on the four positions that carry 85 % of the reference's
     * onsets, and every declared length inside the band its role's statistics
     * name.
     */
    const beatsOf = (value: Readonly<{ numerator: number; denominator: number }>): number =>
      value.numerator / value.denominator;

    expect(ballad.compSlots.map((slot) => beatsOf(slot.offsetBeats))).toEqual([
      0, 1, 2, 3,
    ]);
    for (const slot of ballad.compSlots) {
      expect(slot.cyclePhases).toEqual([0, 1]);
      expect(beatsOf(slot.durationBeats)).toBeGreaterThanOrEqual(0.7);
      expect(beatsOf(slot.durationBeats)).toBeLessThanOrEqual(0.9);
    }
    /*
     * One length, and it is the same length: the measurement's p10, median and
     * p90 are all 0.80 beats of SOUND, which a declared 0.825 produces once
     * P0's release gap is taken off.
     */
    expect([
      ...new Set(ballad.compSlots.map((slot) => beatsOf(slot.durationBeats))),
    ]).toEqual([0.825]);
    /*
     * EVERY slot states the written voicing entire; the width and ceiling rules
     * are what thin it. The table used to declare `upper-voices` on the first
     * three, and that measured 8 % four-note comps against the reference's
     * 26 % while making the beat-4 lift the only slot in the bar with a
     * different bottom voice.
     */
    expect(ballad.compSlots.map((slot) => slot.voicing)).toEqual([
      "all",
      "all",
      "all",
      "all",
    ]);

    /*
     * The bass sits on the four positions that carry 85 % of the reference's
     * onsets — beat 1 (.274), the and of 2 (.162), beat 3 (.180) and the and
     * of 4 (.230) — plus the and of 1, the smallest of the rest, which is what
     * carries the measured length and interval medians. Beat 1 is declared
     * TWICE, once per bar-cycle phase, because the busy bar strikes it short
     * and the open bar holds it.
     */
    expect(ballad.bassSlots.map((slot) => beatsOf(slot.offsetBeats))).toEqual([
      0, 0, 0.5, 1.5, 2, 3.5,
    ]);
    expect(ballad.bassSlots.map((slot) => slot.cyclePhases)).toEqual([
      [0],
      [1],
      [0],
      [0],
      [0],
      [0, 1],
    ]);
    const detached = ballad.bassSlots
      .map((slot) => beatsOf(slot.durationBeats))
      .filter((beats) => beats <= 1);
    expect(detached).toEqual([0.475, 0.475, 0.475, 0.475]);
    const held = ballad.bassSlots
      .map((slot) => beatsOf(slot.durationBeats))
      .filter((beats) => beats > 1);
    expect(held).toEqual([3.5, 1.5]);
    /*
     * The short length is the measurement's own median once the release gap is
     * taken off: 0.475 sounds 0.45. The half-bar note declares 1.5 and is
     * CLIPPED by the anticipation a release gap short of it, sounding 1.44; the
     * 3.5 tail is clipped by whatever follows it and reaches 3.44 in an open
     * bar, against a measured p90 of 3.14 and a maximum of 3.60.
     *
     * The half-bar note declared 1.375 until this round, which sounds 1.35 —
     * the measurement's second length MODE, exactly. 1.5 measures better on the
     * statistic that counts every bar rather than one bucket: the bass sounding
     * fraction. A bucket is a weaker claim than a fraction, so the fraction won.
     */
    expect(0.475 * TICKS_PER_BEAT - PLAYBACK_RELEASE_GAP_TICKS).toBe(432);
    expect(432 / TICKS_PER_BEAT).toBe(0.45);
    expect(
      1.5 * TICKS_PER_BEAT
        - PERFORMANCE_RELEASE_GAP_TICKS
        - PLAYBACK_RELEASE_GAP_TICKS,
    ).toBe(1386);
    /*
     * The tone contour, and it is MEASURED: every assignment of root/third/fifth
     * to the and-of-1, the and-of-2 and beat 3 was scored against the whole
     * statistic vector, and root-root-third-fifth-root won (0.0745 against
     * 0.0992 for an all-root line). It is also the plainest thing a bass player
     * does with a bar: state the root, walk up the chord, come back.
     */
    expect(ballad.bassSlots.map((slot) => slot.tone)).toEqual([
      "root",
      "root",
      "root",
      "third",
      "fifth",
      "root",
    ]);
    /*
     * And exactly ONE slot reaches for the bottom of the register: the open
     * bar's downbeat. `nearest` minimizes motion by definition, so it can never
     * produce the phrase gesture that drops to the bottom of an instrument, and
     * without this the line bottomed out five semitones above the reference's
     * measured minimum.
     */
    expect(ballad.bassSlots.map((slot) => slot.placement)).toEqual([
      "nearest",
      "register-floor",
      "nearest",
      "nearest",
      "nearest",
      "nearest",
    ]);
    expect(
      ballad.bassSlots.filter((slot) => slot.placement === "register-floor")
        .length,
    ).toBe(1);
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
    expect(PERFORMANCE_COMP_TARGET_VOICES).toBe(TARGET_COMP_VOICES);
    expect(PERFORMANCE_COMP_REGISTER_POLICY_VERSION).toBe(1);
    /*
     * The release gap is 1/32 of a beat at PPQ 960 — exact, integral, and
     * small enough to be an articulation rather than a rest.
     */
    expect(PERFORMANCE_RELEASE_GAP_TICKS).toBe(30);
    expect(TICKS_PER_BEAT % PERFORMANCE_RELEASE_GAP_TICKS).toBe(0);
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
    /*
     * The two band sketches are placed differently on purpose, and BOTH now
     * clear the inequality above with room. While the separation was a minor
     * ninth the ballad's window sat exactly ON the floor that inequality left —
     * `lowMidi` could not be lower than 49 and the measured comping register
     * wanted it lower still, so the floor rather than the measurement was
     * placing the comping hand. With the separation a major third the floor is
     * 40, the ballad sits at 45 where the measurement puts it, and the one-lift
     * proof holds by seven semitones rather than by equality.
     */
    expect(registerOf(PERFORMANCE_STYLES["ballad-comp@1"]).lowMidi).toBe(45);
    expect(registerOf(PERFORMANCE_STYLES["ballad-comp@1"]).ceilingMidi).toBe(73);
    expect(
      PERFORMANCE_BASS_REGISTER.highMidi + SEPARATION_SEMITONES - 12,
    ).toBe(40);
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
         * A comp above the HOME octave is there for exactly one of two reasons,
         * and never for a third:
         *
         *  - the bass under it left no room, so the home placement would have
         *    crowded that bass inside the separation; or
         *  - the home placement's TOP would have broken the ceiling, or would
         *    have been further from the previous comp's bottom than the lift
         *    is — that is voice leading, and it is why the lift exists at all
         *    now that the placement is led rather than normalized.
         *
         * Both are checked by re-deriving the placement in
         * `the compiler agrees with the independently derived placement`; here
         * the claim is only that nothing lifts a comp when the home octave was
         * BOTH admissible and no further from the line than the lift.
         */
        if (comp.lowest > register.lowMidi + 11) {
          const bass = comp.bass;
          const home = comp.lowest - 12;
          const homeTop = comp.highest - 12;
          const homeClears =
            bass !== null && home >= bass + SEPARATION_SEMITONES;
          const homeUnderCeiling = homeTop <= register.ceilingMidi;
          const previous = compBottomBefore(result.plan, comp.startTick);
          const homeIsNoFurther =
            previous === null
              ? true
              : Math.abs(home - previous) <= Math.abs(comp.lowest - previous);
          if (homeClears && homeUnderCeiling && homeIsNoFurther) {
            unforced.push(`${comp.eventId}:${String(comp.lowest)}`);
          }
        }
      }
      expect(`${styleId}:${outside.join(",")}`).toBe(`${styleId}:`);
      expect(`${styleId}:${unforced.join(",")}`).toBe(`${styleId}:`);
    }
  });

  test("every comp clears the bass under it by a major third", () => {
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
        /* A comp is never emptied, whatever the ceiling costs it. */
        expect(comp.pitches.length).toBeGreaterThanOrEqual(1);
      }
      expect(`${styleId}:${wide.join(",")}`).toBe(`${styleId}:`);
      expect(`${styleId}:${high.join(",")}`).toBe(`${styleId}:`);
    }
  });

  test("the ceiling thins a comp rather than break itself, and the cost is pinned", () => {
    /*
     * The trade this register makes, stated as numbers so it cannot drift.
     *
     * `PERFORMANCE_COMP_MIN_WIDTH_VOICES` is a bound on the WIDTH rule alone;
     * the separation and ceiling rules are permitted to go below it, because a
     * comp sounding above the instrument's stated ceiling — or crowding the
     * bass inside the separation — is a worse defect than a thin one.
     *
     * On the seeded chart that permission is now UNEXERCISED: fourteen of the
     * twenty-four comps state three voices and ten state four, and none is
     * thinner than three. It used to leave four two-voice comps, and the reason
     * it no longer does is the pair of measured changes this round made — every
     * slot states the whole written voicing, and the ceiling came down to 73
     * from 76 so a wide voicing is thinned by the WIDTH rule (which stops at
     * three) before the ceiling ever has to. Against the reference's
     * 3:70 % / 4:26 % / 2:3 %, 58 %-against-42 % measures a histogram
     * divergence of 0.157 where the old table measured 0.184.
     *
     * The permission itself is still a live law and still proved: `the register
     * laws are real gates` below shows the WRITTEN voicings failing it, and
     * `every comp sits inside its style's register` shows the lift being
     * forced.
     */
    const performance = performed(deaconBluesLiteralPlan());
    const facts = compFactsOf(performance);
    expect(facts.length).toBe(24);
    expect(facts.filter((comp) => comp.pitches.length === 2).length).toBe(0);
    expect(facts.filter((comp) => comp.pitches.length === 3).length).toBe(14);
    expect(facts.filter((comp) => comp.pitches.length === 4).length).toBe(10);
    /* Never emptied, and never above the ceiling that caused the thinning. */
    const register = registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]);
    for (const comp of facts) {
      expect(comp.pitches.length).toBeGreaterThanOrEqual(1);
      expect(comp.highest).toBeLessThanOrEqual(register.ceilingMidi);
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
      /*
       * All of them, per style: twenty-four ballad comps — the measured
       * quarter-note grid over six bars — twenty-two Charleston stabs,
       * twenty-three bossa hits across the two-bar figure, twenty-four
       * pop-eighths hits, twenty-nine sixteenth-push hits (4+6+4+6 over
       * the four two-chord bars — the phase-1 bars gain the mid-bar arrival
       * their table does not declare — plus 4 and 5 for the whole-bar
       * statement and answer), and nineteen uptempo-swing stabs (3+4+3+4
       * over the four two-chord bars — arrival statement, the swung
       * and-of-2, and in phase-1 bars the beat-4 answer plus the mid-bar
       * arrival — plus 2 and 3 for the whole-bar statement and answer).
       * A style missing from this tally has not had its normalization law
       * checked at all.
       */
      const CHECKED_COMPS: Record<string, number> = {
        "ballad-comp@1": 24,
        "medium-swing@1": 22,
        "bossa-nova@1": 23,
        "straight-eighths@1": 24,
        /* Re-pinned for the transcribed answer-key table (2026-07-31). */
        "syncopated-sixteenths@1": 33,
        /* Authored fast-swing sketch (2026-08-06). */
        "uptempo-swing@1": 19,
      };
      expect(`${styleId}:${String(checked)}`).toBe(
        `${styleId}:${String(CHECKED_COMPS[styleId] ?? -1)}`,
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
      /*
       * The placement is LED from the previous comp's bottom voice, so the
       * re-derivation has to walk the comps in emitted order and carry that
       * note forward exactly as the compiler does. Threading it here is also
       * the determinism claim in miniature: the octave a comp lands in is a
       * function of the plan prefix and nothing else.
       */
      let previousCompBottom: number | null = null;
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
          (
            ["all", "upper-voices", "guide-tones", "top-voice"] as const
          ).map((voicing) =>
            independentlyPlacedComp(
              compVoicesOf(chord.midiPitches, voicing),
              comp.bass,
              register,
              previousCompBottom,
            ).join("/"),
          ),
        );
        if (!derived.has(comp.pitches.join("/"))) {
          disagreements.push(
            `${comp.eventId}:${comp.pitches.join("/")}`
            + `!in{${[...derived].join(" ")}}`,
          );
        }
        previousCompBottom = comp.pitches[0] ?? previousCompBottom;
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
    let aboveTheCeiling = 0;
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
      if (highest > register.ceilingMidi) aboveTheCeiling += 1;
    }
    /*
     * NINE of the ten written voicings reach above the comping ceiling, FOUR
     * put their lowest note outside the comping window entirely, and FIVE span
     * more than a nineteenth. Nearly the whole chart, on three separate laws,
     * so none of the three is vacuous.
     *
     * Two of the five counters are pinned at ZERO, and both zeros are RESULTS
     * rather than gaps in the control:
     *
     *  - `inUnisonOrBelow` is zero because the collisions in the original
     *    report (written notes 50 and 51 in unison with the bass under them)
     *    were against a bass register topping out at 52. The measured window
     *    tops out at 48, so a written voicing can no longer land ON the bass
     *    note the performance sounds under it.
     *  - `crowdingTheBass` is zero BECAUSE THE SEPARATION LAW WAS RELAXED, and
     *    that is the honest reading of it. While the law demanded a minor ninth
     *    six of the ten written voicings broke it; a major third is a floor the
     *    Auto policy's own 48..84 generation range clears on its own under this
     *    bass line. The separation rule is therefore no longer doing work on
     *    THIS chart — it is a guard against a bass climbing into a comp, not a
     *    register policy, which is exactly the demotion the measurement asked
     *    for. It is still proved live by `every comp clears the bass under it
     *    by a major third` across both band sketches and every fixture.
     *
     * Both zeros are kept, because a register or a separation that crept back
     * would break them.
     */
    expect({
      aboveTheCeiling,
      crowdingTheBass,
      tooWide,
      outsideRegister,
      inUnisonOrBelow,
    }).toEqual({
      aboveTheCeiling: 9,
      crowdingTheBass: 0,
      tooWide: 5,
      outsideRegister: 4,
      inUnisonOrBelow: 0,
    });
  });

  test("the seeded chart's comps are pinned, bar by bar", () => {
    /*
     * The re-derived expectation. Read as music: a comping hand states its
     * chord on every quarter, its bottom voice between A2 and C4, over a bass
     * line that walks the whole measured window from its top to its bottom.
     */
    const performance = performed(deaconBluesLiteralPlan());
    expect(
      compFactsOf(performance).map(
        (comp) => `${String(comp.startTick)}:${comp.pitches.join("/")}`,
      ),
    ).toEqual([
      "0:60/64/67/71",
      "960:60/64/67/71",
      "1920:57/62/67",
      "2880:57/62/67",
      "3840:46/57/62/65",
      "4800:46/57/62/65",
      "5760:45/53/55/60",
      "6720:45/53/55/60",
      "7680:54/69/73",
      "8640:54/69/73",
      "9600:57/64/71",
      "10560:57/64/71",
      "11520:60/64/67/71",
      "12480:60/64/67/71",
      "13440:59/62/67/69",
      "14400:59/62/67/69",
      "15360:58/62/67",
      "16320:58/62/67",
      "17280:58/62/67",
      "18240:58/62/67",
      "19200:56/62/67",
      "20160:56/62/67",
      "21120:56/62/67",
      "22080:56/62/67",
    ]);
    /*
     * Every slot is declared `all`, so a comp sounds four voices whenever the
     * written voicing has four to give and the width and ceiling rules leave
     * them: ten of the twenty-four here. Every bottom voice sits inside the
     * register's declared range, and the ones above the HOME octave are there
     * because the ceiling or the voice leading put them there rather than
     * because normalization wrapped.
     *
     * Note the pairs: within one chord the comp does not move at all, which is
     * the reference's own dominant behaviour (72 % of its comp motions are
     * zero). Before every slot stated the whole voicing, the beat-4 lift alone
     * had a different bottom voice and broke every one of those pairs.
     */
    const facts = compFactsOf(performance);
    const register = registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]);
    const bottoms = facts.map((comp) => comp.lowest);
    expect(facts.filter((comp) => comp.pitches.length === 4).length).toBe(10);
    expect(Math.min(...bottoms)).toBe(45);
    expect(Math.max(...bottoms)).toBe(60);
    expect(Math.min(...bottoms)).toBeGreaterThanOrEqual(register.lowMidi);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(register.highMidi);
    /* The bass line, pinned: the measured window, used from end to end. */
    expect(
      performance.events
        .filter((event) => roleOf(event.eventId) === "bass")
        .map((event) => Number(event.midiPitches[0])),
    ).toEqual([
      48, 48, 40, 35, 35, 34, 33, 33, 38, 38, 42, 37, 37, 36, 35, 35, 39, 39,
      43, 46, 39, 28, 28,
    ]);
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
     * moved: twenty-two written notes sit above the ballad's comping ceiling,
     * up to MIDI 84, and the identity keeps every one of them exactly where the
     * chart wrote it.
     */
    const ballad = registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]);
    expect(
      result.plan.events
        .flatMap((event) => [...event.midiPitches].map((midi) => Number(midi)))
        .filter((midi) => midi > ballad.ceilingMidi)
        .sort((left, right) => left - right),
    ).toEqual([
      74, 74, 74, 74, 74, 76, 76, 76, 77, 77, 79, 79, 79, 79, 79, 79, 79, 81,
      83, 83, 83, 84,
    ]);
  });

  test("the comp's octave is LED from the previous comp, not normalized", () => {
    /*
     * The rule this test exists for, and the defect it replaced.
     *
     * Placing a comp used to mean NORMALIZING it: transpose the whole voicing
     * until its bottom voice lands in the home octave `[lowMidi, lowMidi + 11]`,
     * which is twelve consecutive semitones and therefore has exactly one
     * answer for any pitch class. Unique, tie-break-free — and it WRAPS. Two
     * chords whose bottom voices are a semitone apart across the octave's
     * boundary are normalized eleven semitones apart, so the comping hand
     * leapt an octave between adjacent bars for no musical reason at all.
     * Measured against the style reference that put our comp's bottom-voice
     * motion at 1.65 semitones mean and 4.60 p90 against its 0.82 and 2.00.
     *
     * The rule now is: of the placements the register ADMITS — the home octave
     * and the lift above it, filtered by the separation floor and the ceiling —
     * take the one whose bottom voice is NEAREST the previous comp's bottom,
     * ties down. That is voice leading, and it is exactly as deterministic as
     * normalization was: the previous comp bottom is a pure function of the
     * plan prefix, the candidate set has at most two members, and the tie-break
     * is stated.
     *
     * Both halves are asserted here: that the emitted placement is the nearer
     * one, and that the rule is not vacuous — some comps land somewhere pure
     * normalization would NOT have put them.
     */
    const performance = performed(deaconBluesLiteralPlan());
    const register = registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]);
    const facts = compFactsOf(performance);
    expect(facts.length).toBeGreaterThan(0);

    let ledAwayFromHome = 0;
    let previous: number | null = null;
    const wrong: string[] = [];
    for (const comp of facts) {
      /*
       * Where PURE home normalization would have put this same voicing: the
       * one shift landing its bottom in the twelve-semitone home octave.
       */
      const home =
        comp.lowest
        - 12 * Math.floor((comp.lowest - register.lowMidi) / 12);
      const lift = home + 12;
      const bass = comp.bass;
      const floor =
        bass === null
          ? register.lowMidi
          : Math.max(register.lowMidi, bass + SEPARATION_SEMITONES);
      const span = comp.span;
      const admissible = [home, lift].filter(
        (bottom) =>
          bottom >= floor && bottom + span <= register.ceilingMidi,
      );
      /* The emitted placement must BE one of the admissible ones. */
      if (!admissible.includes(comp.lowest)) {
        wrong.push(`${comp.eventId}:inadmissible:${String(comp.lowest)}`);
        previous = comp.lowest;
        continue;
      }
      const leadFrom: number = previous ?? register.lowMidi;
      const nearest: number = admissible.reduce(
        (best: number, bottom: number): number =>
          Math.abs(bottom - leadFrom) < Math.abs(best - leadFrom)
            ? bottom
            : best,
      );
      if (comp.lowest !== nearest) {
        wrong.push(
          `${comp.eventId}:${String(comp.lowest)}!=${String(nearest)}`,
        );
      }
      if (comp.lowest !== home) ledAwayFromHome += 1;
      previous = comp.lowest;
    }
    expect(wrong).toEqual([]);
    /*
     * NOT VACUOUS: fourteen of the twenty-four comps sit somewhere pure home
     * normalization would not have put them, and every one of them is nearer
     * to the comp before it than the home octave would have been.
     */
    expect(ledAwayFromHome).toBe(14);

    /*
     * And the measured effect, stated as the statistic it was fitted to: the
     * comping hand's bottom-voice motion. Under normalization this line moved
     * 1.65 semitones on average with a p90 of 4.60; led, and with every slot
     * stating the whole written voicing, it moves 1.48 with a p90 of 3.
     */
    const bottoms = facts.map((comp) => comp.lowest);
    const motions: number[] = [];
    for (let index = 1; index < bottoms.length; index += 1) {
      motions.push(Math.abs((bottoms[index] ?? 0) - (bottoms[index - 1] ?? 0)));
    }
    expect(Math.max(...motions)).toBeLessThanOrEqual(11);
    expect(
      motions.reduce((sum, value) => sum + value, 0) / motions.length,
    ).toBeCloseTo(1.478, 3);
  });

  test("the lead carries nothing between compiles: a plan is a pure function", () => {
    /*
     * The determinism claim the led placement owes, asked the way it could
     * actually fail. Compiling twice in a row already proves the output is
     * stable; what a carried "previous comp bottom" could break is PURITY —
     * a compile of one plan influencing the next. So the same plan is compiled
     * before and after two compiles of a DIFFERENT chart, and the bytes must
     * be identical.
     */
    const literal = deaconBluesLiteralPlan();
    const other = literalPlanOf(
      publishChart(
        "| Bmaj7 Eb7 | Abm7 Db7 |",
        meterOf(4, 4),
        "document-performance-lead-purity",
      ),
    );
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const before = compilePerformancePlan({ plan: literal, styleId });
      const interleavedFirst = compilePerformancePlan({
        plan: other,
        styleId,
      });
      const interleavedSecond = compilePerformancePlan({
        plan: other,
        styleId,
      });
      const after = compilePerformancePlan({ plan: literal, styleId });
      expect(before.ok && after.ok).toBe(true);
      expect(interleavedFirst.ok && interleavedSecond.ok).toBe(true);
      if (!before.ok || !after.ok) throw new Error(`LEAD_PURITY:${styleId}`);
      if (!interleavedFirst.ok || !interleavedSecond.ok) {
        throw new Error(`LEAD_PURITY_OTHER:${styleId}`);
      }
      expect(JSON.stringify(after.plan)).toBe(JSON.stringify(before.plan));
      expect(JSON.stringify(interleavedSecond.plan)).toBe(
        JSON.stringify(interleavedFirst.plan),
      );
      expect(after.evidence).toEqual(before.evidence);
      /* And the two charts really do compile to different music. */
      expect(JSON.stringify(after.plan)).not.toBe(
        JSON.stringify(interleavedFirst.plan),
      );
    }
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
     * The collision in its concrete form, and this table makes it sharper than
     * the one before it did. ballad-comp@1 declares a comp at offset 0 AND a
     * bass at offset 0 — the downbeat carries 27 % of the reference's bass
     * onsets, the largest share of any position in the bar — so every
     * bar-aligned chord reaches a declared slot of BOTH roles on its own start
     * tick and is a candidate for the arrival law in both. The declared slot
     * wins each time and exactly one event of each role sounds there.
     *
     * Two bass slots share the offset-0 declaration, one per phase, so the
     * guard also has to survive a table where two entries name the same tick
     * and only one of them sounds in the bar being compiled.
     *
     * The guard is asked of the tick a slot is ACTUALLY played at. This style
     * declares straight eighths, so for it those are the same ticks — the
     * question is asked of emitted ticks anyway, because a style that swings
     * would otherwise be answered about a position it never plays.
     */
    const style = PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE];
    expect(
      style.compSlots.map((slot) => declaredOffsetTicks(slot.offsetBeats)),
    ).toEqual([0, 960, 1920, 2880]);
    expect(
      style.bassSlots.map((slot) => declaredOffsetTicks(slot.offsetBeats)),
    ).toEqual([0, 0, 480, 1440, 1920, 3360]);
    expect(independentlySwung(480, style)).toBe(480);
    expect(independentlySwung(1440, style)).toBe(1440);

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
                compBottomBefore(
                  result.plan,
                  Number(statement?.startTick ?? chord.startTick),
                ),
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
     * Its own chord's voicing, in the comping register: the WHOLE written
     * voicing with its written intervals, moved as a unit, thinned only where
     * the width or ceiling rule bites. Every pitch class is a SUBSET of the
     * written chord's — every one of them the chord's own, none invented.
     */
    expect([...comp.midiPitches].map((midi) => Number(midi))).toEqual([
      ...independentlyPlacedComp(
        compVoicesOf(
          [...second.midiPitches].map((midi) => Number(midi)),
          "all",
        ),
        bassSoundingAt(performance, 1920),
        registerOf(PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE]),
        compBottomBefore(performance, 1920),
      ),
    ]);
    expect(comp.midiPitches.length).toBeGreaterThanOrEqual(
      PERFORMANCE_COMP_MIN_WIDTH_VOICES,
    );
    const writtenClasses = new Set(
      [...second.midiPitches].map((midi) => ((midi % 12) + 12) % 12),
    );
    expect(
      [...comp.midiPitches].every((midi) =>
        writtenClasses.has(((midi % 12) + 12) % 12),
      ),
    ).toBe(true);
    expect(sourceIdOf(String(comp.eventId))).toBe(String(second.eventId));
  });
});

describe("swing", () => {
  test("the ballad declares NONE, and its offsets are therefore played as written", () => {
    /*
     * Measured, and it overturned a declared 9/16 lilt. 671 of the reference
     * bass's 681 onsets and 2 572 of its comping instrument's 2 584 sit
     * EXACTLY on the eighth-note grid; nothing in either part is displaced
     * into a swung or triplet position. A straight ratio is also what lets the
     * and-of-2 bass note release before beat 3 at the measured length: a 9/16
     * displacement leaves it 0.4375 of a beat where the measurement says 0.45.
     */
    const style = PERFORMANCE_STYLES[STUDIO_PERFORMANCE_STYLE];
    expect(style.swingRatio).toEqual({ numerator: 1, denominator: 2 });
    /* The identity: a straight ratio moves nothing, at any position. */
    for (const offset of [0, 240, 320, 480, 960, 1440, 1920, 2400, 3360]) {
      expect(independentlySwung(offset, style)).toBe(offset);
    }

    const performance = performed(deaconBluesLiteralPlan());
    for (const event of performance.events) {
      const within = event.startTick % TICKS_PER_BEAT;
      /* Every attack is on a beat or exactly halfway through one. */
      expect(within === 0 || within === TICKS_PER_BEAT / 2).toBe(true);
      expect(Number.isInteger(event.startTick)).toBe(true);
      /*
       * And the offbeats are the BASS's alone: the measured comp grid sits
       * dead on the quarter, so an offbeat comp would be this style playing a
       * feel its own statistics do not have.
       */
      if (roleOf(event.eventId) === "comp") expect(within).toBe(0);
    }
    /* The offbeats are real, and they are the measured syncopation. */
    const offbeats = performance.events.filter(
      (event) => event.startTick % TICKS_PER_BEAT !== 0,
    );
    expect(offbeats.length).toBe(12);
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

/* ------------------------------------------------------------------ */
/* The articulation laws the measured tables introduced.                */
/* ------------------------------------------------------------------ */

/**
 * Ticks of each bar in which at least one event of `role` is sounding.
 *
 * The UNION of the role's sounding intervals clipped to the bar, not the sum
 * of their lengths: a role that ever sounded two notes at once would otherwise
 * count the overlap twice and could report a bar as more than full. This layer
 * forbids that overlap, so on today's plans the two agree — the union is what
 * "sounding" means, and it keeps the law true of a future style that allowed
 * two voices in one role.
 */
function soundingTicksPerBar(
  performance: PlaybackPlan,
  role: "bass" | "comp",
): readonly number[] {
  const bars = performance.totalTicks / TICKS_PER_BAR;
  const spans = performance.events
    .filter((event) => roleOf(event.eventId) === role)
    .map(
      (event) =>
        [
          Number(event.startTick),
          Number(event.startTick) + Number(event.durationTicks),
        ] as const,
    )
    .sort((left, right) => left[0] - right[0]);
  const perBar: number[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * TICKS_PER_BAR;
    const barEnd = barStart + TICKS_PER_BAR;
    let sounding = 0;
    let covered = barStart;
    for (const [start, end] of spans) {
      const from = Math.max(start, covered, barStart);
      const to = Math.min(end, barEnd);
      if (to > from) {
        sounding += to - from;
        covered = to;
      }
    }
    perBar.push(sounding);
  }
  return perBar;
}

describe("the release laws the measured tables introduced", () => {
  test("every note CLEARS before the next attack of its own role", () => {
    /*
     * The law this whole tuning exists for, and it is strictly stronger than
     * the no-overlap law above: no-overlap permits a note to end exactly where
     * the next one begins, which is a legato smear rather than an attack. Here
     * every consecutive pair of one role is separated by at least
     * `PERFORMANCE_RELEASE_GAP_TICKS` of SILENCE.
     *
     * It holds two ways at once. Where the clipping law shortens a slot, the
     * compiler pulls the release back by the gap; where the declared length
     * already ends early, the style table has left more air than the gap
     * demands. Both are checked here, because the law must hold whichever of
     * the two produced the note.
     */
    const literal = deaconBluesLiteralPlan();
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`RELEASE_COMPILE:${styleId}`);
      for (const role of ["bass", "comp"] as const) {
        const inRole = result.plan.events.filter(
          (event) => roleOf(event.eventId) === role,
        );
        expect(inRole.length).toBeGreaterThan(0);
        const tooClose: string[] = [];
        for (let index = 1; index < inRole.length; index += 1) {
          const previous = inRole[index - 1];
          const current = inRole[index];
          if (previous === undefined || current === undefined) {
            throw new Error(`RELEASE_ORDER:${styleId}`);
          }
          const gap =
            Number(current.startTick)
            - Number(previous.startTick)
            - Number(previous.durationTicks);
          if (gap < PERFORMANCE_RELEASE_GAP_TICKS) {
            tooClose.push(`${String(previous.eventId)}:${String(gap)}`);
          }
        }
        expect(`${styleId}/${role}:${tooClose.join(",")}`).toBe(
          `${styleId}/${role}:`,
        );
      }
    }
  });

  test("the release gap is load-bearing: the ballad bass sits exactly on it", () => {
    /*
     * A bound nothing reaches is a bound nothing proves. ballad-comp@1's
     * downbeat slot in the OPEN bar is declared to ring 7/2 beats and is
     * clipped back to the and-of-4 that follows it, so its release is decided
     * by the gap and by nothing else — the narrowest clearance in the style is
     * exactly `PERFORMANCE_RELEASE_GAP_TICKS`. Delete the gap and this is 0.
     */
    const performance = performed(deaconBluesLiteralPlan());
    const gaps: number[] = [];
    for (const role of ["bass", "comp"] as const) {
      const inRole = performance.events.filter(
        (event) => roleOf(event.eventId) === role,
      );
      for (let index = 1; index < inRole.length; index += 1) {
        const previous = inRole[index - 1];
        const current = inRole[index];
        if (previous === undefined || current === undefined) {
          throw new Error("RELEASE_TIGHTEST");
        }
        gaps.push(
          Number(current.startTick)
          - Number(previous.startTick)
          - Number(previous.durationTicks),
        );
      }
    }
    expect(Math.min(...gaps)).toBe(PERFORMANCE_RELEASE_GAP_TICKS);
  });

  test("no role ever fills a bar: the sounding fraction is bounded and measured", () => {
    /*
     * The anti-pad law. Before this tuning a comp sustained its chord's entire
     * written length and a bass note rang up to four beats, so both roles
     * sounded for the WHOLE bar and the arrangement had no attacks in it at
     * all. Here every bar of every band sketch leaves each role real silence,
     * and the ballad's fractions are pinned against the measurement they were
     * fitted to: the reference sounds its bass for 0.893 of the bar and its
     * comping instrument for 0.793.
     */
    const literal = deaconBluesLiteralPlan();
    for (const styleId of BAND_SKETCH_STYLE_IDS) {
      const result = compilePerformancePlan({ plan: literal, styleId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`SOUNDING_COMPILE:${styleId}`);
      for (const role of ["bass", "comp"] as const) {
        const perBar = soundingTicksPerBar(result.plan, role);
        expect(perBar.length).toBe(6);
        for (const ticks of perBar) {
          expect(ticks).toBeGreaterThan(0);
          expect(ticks).toBeLessThan(TICKS_PER_BAR);
        }
      }
    }

    const performance = performed(literal);
    expect(soundingTicksPerBar(performance, "bass")).toEqual([
      3216, 3750, 3216, 3750, 3216, 3780,
    ]);
    expect(soundingTicksPerBar(performance, "comp")).toEqual([
      3168, 3168, 3168, 3168, 3168, 3168,
    ]);
    /*
     * 0.908 of the plan for the bass against a measured 0.893, and 0.825 for
     * the comp against a measured 0.793. Both excesses are the release gap and
     * nothing else: measured against the GATES the engine actually holds — the
     * declared length less P0's own 24-tick release — the same plan sounds
     * 0.884 of the bar for the bass and 0.800 for the comp, which is the
     * reference's 0.893 and 0.793 to within a hundredth. This assertion counts
     * declared durations rather than gates on purpose, because it is the
     * CLIPPING law it exists to hold, and every number in it is a tick.
     */
    const fraction = (role: "bass" | "comp"): number =>
      soundingTicksPerBar(performance, role).reduce(
        (sum, ticks) => sum + ticks,
        0,
      ) / performance.totalTicks;
    expect(fraction("bass")).toBeCloseTo(0.908, 3);
    expect(fraction("comp")).toBeCloseTo(0.825, 3);
  });
});

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
     * The seeded document's own tempo reaches the transport: 105 BPM in 4/4,
     * the measured tempo the ballad table's offsets and note lengths were
     * computed at. At 76 the harmonic rhythm of two chords a bar crawled; at
     * the 116 this seeded before, every release in the style was 10 % shorter
     * than the measurement says it is.
     */
    expect(scheduled.tempoBpm).toBe(105);
    /* The transport received the performance, not the ten written pads. */
    expect(scheduled.events.length).toBe(47);
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
