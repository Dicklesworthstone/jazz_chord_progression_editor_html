/**
 * The syncopated-sixteenths@1 style table's own laws — SECOND AUTHORING,
 * after measurement (owner-directed What a Fool Believes campaign,
 * 2026-07-31).
 *
 * THE CONTRADICTION THIS FILE RECORDS. The first authoring of this suite
 * froze the style's claimed identity as attacks a sixteenth OFF the eighth
 * grid — "the pushes into beats 2 and 4, the cross-barline anticipations" —
 * and proved them absent from every other style. The owner rejected that
 * groove by ear, and the render-and-compare campaign against an
 * owner-supplied reference sequence (68 aggregate dimensions, ~250 scored
 * iterations, divergence 0.327 → 0.101) refuted the claim: the reference's
 * attack mass sits entirely ON the eighth grid, and the syncopation lives
 * in WHICH eighths sound, the accents, and the rests. Per the Deacon Blues
 * rule — when a self-authored law contradicts measurement, change the law
 * and record the contradiction — the eighth-grid law below is the exact
 * inversion of the sub-eighth law it replaces.
 *
 * Every number below is authored HERE, from the campaign's final fixture
 * (rounds/final.json of the measured campaign), never read back from the
 * table it checks — a table edit that changes the groove must turn this
 * file red. Green gates still never prove a groove sounds right; the
 * owner's ear remains the final gate.
 */
import { describe, expect, test } from "bun:test";

import { STARTER_CHART } from "../../src/application/studio-starter-chart";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { validateDocumentSemantics } from "../../src/application";
import { PROGRESSION_LIBRARY } from "../../src/application/studio-progression-library";
import {
  decodeDocumentShape,
  DEFAULT_GROOVE_STYLE_ID,
  GROOVE_STYLE_IDS,
  PROGRESSION_DOCUMENT_SCHEMA,
  type ValidatedDocument,
} from "../../src/domain";
import { parseChartText } from "../../src/theory";
import {
  compilePerformancePlan,
  PERFORMANCE_STYLES,
  PERFORMANCE_STYLE_IDS,
  type PerformanceStyleId,
  type PlaybackPlan,
} from "../../src/playback";

/* ------------------------------------------------------------------ */
/* Independently authored expectations (PPQ 960; an eighth is 480).    */
/* ------------------------------------------------------------------ */

const STYLE_ID = "syncopated-sixteenths@1" as const;
const BAR_TICKS = 3_840;
const EIGHTH = 480;

/**
 * The four-phase bass, per phase: [offsetTicks, tone, placement,
 * durationTicks, velocity]. Phase 1 is the near-solo whole note (the
 * reference's per-bar density varies, CV 0.39); phase 2 enters at beat 3
 * (the arrival law supplies the chord-start root); the register-floor
 * placements are the octave drops the reference's leap profile demanded.
 */
const EXPECTED_BASS = {
  0: [
    [0, "root", "register-floor", 420, 92],
    [480, "third", "nearest", 300, 80],
    [1_440, "fifth", "nearest", 420, 78],
    [1_920, "root", "nearest", 420, 82],
    [2_880, "third", "register-floor", 600, 75],
    [3_360, "root", "nearest", 420, 84],
  ],
  1: [[0, "root", "nearest", 960, 90]],
  2: [
    [1_920, "root", "register-floor", 420, 92],
    [2_400, "third", "register-floor", 420, 80],
    [3_360, "root", "nearest", 420, 82],
  ],
  3: [
    [0, "root", "register-floor", 300, 90],
    [480, "root", "nearest", 420, 80],
    [3_360, "root", "nearest", 300, 92],
  ],
} as const;

/**
 * The four-phase comp, per phase: [offsetTicks, voicing, durationTicks,
 * velocity]. Phase 3 is the pedal bar — one held chord and nothing to
 * truncate it. The thin voicings (top-voice, guide-tones) are the moving
 * right-hand line; the arrival floor widens any of them that lands on a
 * chord's own start.
 */
const EXPECTED_COMP = {
  0: [
    [480, "all", 300, 72],
    [960, "upper-voices", 360, 76],
    [1_440, "guide-tones", 360, 82],
    [1_920, "upper-voices", 480, 80],
    [2_880, "all", 360, 88],
    [3_360, "top-voice", 300, 68],
  ],
  1: [
    [960, "upper-voices", 240, 72],
    [1_440, "upper-voices", 360, 76],
    [1_920, "upper-voices", 360, 74],
    [2_400, "upper-voices", 360, 74],
    [3_360, "guide-tones", 300, 70],
  ],
  2: [
    [480, "top-voice", 360, 72],
    [960, "upper-voices", 360, 78],
    [2_400, "upper-voices", 600, 76],
    [3_360, "upper-voices", 600, 72],
  ],
  3: [[0, "all", 3_840, 76]],
} as const;

const OTHER_BAND_SKETCHES = PERFORMANCE_STYLE_IDS.filter(
  (id) => id !== STYLE_ID && PERFORMANCE_STYLES[id].kind === "band-sketch",
);

/* ------------------------------------------------------- chart plumbing */

const AUTO_BALANCED = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

function candidateFor(
  chartText: string,
  documentId: string,
  grooveStyleId?: string,
): Record<string, unknown> {
  const parsed = parseChartText(
    chartText,
    { meter: { beatsPerBar: 4, beatUnit: 4 }, mode: "fragment" },
    "ascii",
  );
  if (!parsed.ok) throw new Error("SIXTEENTHS_TEST_T0");
  let eventOrdinal = 0;
  return {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: documentId,
    title: "Sixteenths reference",
    description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    key: null,
    sections: parsed.draft.sections.map((section, sectionIndex) => ({
      id: `section-sixteenths-${String(sectionIndex)}`,
      name: "A",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: section.measures.map((measure, measureIndex) => ({
        id: `measure-sixteenths-${String(measureIndex)}`,
        events: measure.events.map((event) => {
          eventOrdinal += 1;
          return {
            id: `event-sixteenths-${String(eventOrdinal)}`,
            chord: event.chord,
            voicing: AUTO_BALANCED,
            duration: {
              numerator: event.duration.numerator,
              denominator: event.duration.denominator,
            },
            annotation: "",
          };
        }),
        completion: { kind: "complete" },
      })),
    })),
    playback: {
      instrumentId: "concert-grand",
      masterVolume: 0.9,
      reverbAmount: 0.3,
      countInBars: 0,
      ...(grooveStyleId === undefined ? {} : { grooveStyleId }),
    },
  };
}

function publishedChart(chartText: string, documentId: string): ValidatedDocument {
  const decoded = decodeDocumentShape(candidateFor(chartText, documentId));
  if (!decoded.ok) {
    throw new Error(`SIXTEENTHS_TEST_F2:${decoded.errors[0].code}`);
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(`SIXTEENTHS_TEST_F3:${published.errors[0].code}`);
  }
  return published.value;
}

function literalPlanOf(document: ValidatedDocument): PlaybackPlan {
  const compiled = compileStudioPlaybackPlan(document);
  if (!compiled.ok) throw new Error("SIXTEENTHS_TEST_P0");
  return compiled.plan;
}

function performedBy(plan: PlaybackPlan, styleId: PerformanceStyleId): PlaybackPlan {
  const result = compilePerformancePlan({ plan, styleId });
  if (!result.ok) {
    throw new Error(`SIXTEENTHS_TEST_COMPILE:${styleId}:${result.refusal.code}`);
  }
  return result.plan;
}

function roleOf(eventId: string): "bass" | "comp" | "source" {
  const dot = eventId.lastIndexOf(".");
  if (dot < 0) return "source";
  const suffix = eventId.slice(dot + 1, dot + 2);
  return suffix === "b" ? "bass" : suffix === "c" ? "comp" : "source";
}

function ticksToBeats(offset: Readonly<{ numerator: number; denominator: number }>): number {
  return (offset.numerator * 960) / offset.denominator;
}

/* ------------------------------------------------------------- the laws */

describe("the syncopated-sixteenths style table", () => {
  const style = PERFORMANCE_STYLES[STYLE_ID];

  test("declares the measured four-phase bass, slot for slot", () => {
    expect(style.kind).toBe("band-sketch");
    expect(style.meter).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(style.barCycleLength).toBe(4);
    expect([...style.barCycleVelocityOffsets]).toEqual([0, -2, -1, -3]);
    expect(style.swingRatio).toEqual({ numerator: 1, denominator: 2 });

    for (const phase of [0, 1, 2, 3] as const) {
      const declared = style.bassSlots
        .filter((slot) => slot.cyclePhases.includes(phase))
        .map((slot) => [
          ticksToBeats(slot.offsetBeats),
          slot.tone,
          slot.placement,
          ticksToBeats(slot.durationBeats),
          slot.velocity,
        ])
        .sort((left, right) => Number(left[0]) - Number(right[0]));
      expect(declared).toEqual(EXPECTED_BASS[phase].map((row) => [...row]));
    }
    expect(style.bassSlots.length).toBe(13);
    for (const slot of style.bassSlots) {
      expect(slot.cyclePhases.length).toBe(1);
    }
  });

  test("declares the measured four-phase comp, pedal bar included", () => {
    for (const phase of [0, 1, 2, 3] as const) {
      const declared = style.compSlots
        .filter((slot) => slot.cyclePhases.includes(phase))
        .map((slot) => [
          ticksToBeats(slot.offsetBeats),
          slot.voicing,
          ticksToBeats(slot.durationBeats),
          slot.velocity,
        ])
        .sort((left, right) => Number(left[0]) - Number(right[0]));
      expect(declared).toEqual(EXPECTED_COMP[phase].map((row) => [...row]));
    }
    expect(style.compSlots.length).toBe(16);
  });

  test("every attack sits ON the eighth grid: the inverted law the measurement forced", () => {
    /*
     * The first authoring proved sub-eighth attacks PRESENT; the reference
     * proved the idiom is played on the eighth grid with the syncopation in
     * accent and placement. This is the recorded contradiction.
     */
    for (const slot of [...style.bassSlots, ...style.compSlots]) {
      const offset = ticksToBeats(slot.offsetBeats);
      expect(offset % EIGHTH).toBe(0);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(BAR_TICKS);
    }
  });

  test("keeps the balance law and the off-beat weighting", () => {
    const loudestBass = Math.max(...style.bassSlots.map((slot) => slot.velocity));
    const loudestComp = Math.max(...style.compSlots.map((slot) => slot.velocity));
    expect(loudestComp).toBeLessThan(loudestBass);
    /* More attacks OFF the quarter grid than on it: the syncopation claim. */
    const all = [...style.bassSlots, ...style.compSlots];
    const offQuarter = all.filter(
      (slot) => ticksToBeats(slot.offsetBeats) % 960 !== 0,
    );
    expect(offQuarter.length).toBeGreaterThan(all.length - offQuarter.length);
  });

  test("declares the measured registers: the lifted right hand and its own electric bass", () => {
    expect(style.compRegister).toEqual({ lowMidi: 60, highMidi: 83, ceilingMidi: 94 });
    /*
     * The per-style bass register is the field this campaign added: the
     * reference bass lives at MIDI 41..61, an octave above the package's
     * jazz register, and no other style may be detuned to reach it.
     */
    expect(style.bassRegister).toEqual({ lowMidi: 43, highMidi: 61, anchorMidi: 55 });
    for (const other of OTHER_BAND_SKETCHES) {
      expect(PERFORMANCE_STYLES[other].bassRegister).toBeNull();
    }
  });
});

describe("the compiled measured groove", () => {
  /* The seeded chart: bars 0-3 carry two chords, bars 4-5 one whole-bar chord. */
  const literal = literalPlanOf(
    publishedChart(STARTER_CHART.chartText, "document-sixteenths-reference"),
  );
  const performance = performedBy(literal, STYLE_ID);

  function relativeAttacks(barStart: number, role: "bass" | "comp"): number[] {
    return performance.events
      .filter(
        (event) =>
          roleOf(event.eventId) === role &&
          event.startTick >= barStart &&
          event.startTick < barStart + BAR_TICKS,
      )
      .map((event) => event.startTick - barStart)
      .sort((left, right) => left - right);
  }

  test("a whole-bar phase-0 chord states the measured figure exactly", () => {
    /*
     * Bar 4 (Ebmaj7): written measure index 4, phase 0. The bass declares
     * its own downbeat; the comp does not, so the arrival law adds the
     * chord statement at 0 beside the declared eighth-grid figure.
     */
    const barStart = 4 * BAR_TICKS;
    expect(relativeAttacks(barStart, "bass")).toEqual([
      0, 480, 1_440, 1_920, 2_880, 3_360,
    ]);
    expect(relativeAttacks(barStart, "comp")).toEqual([
      0, 480, 960, 1_440, 1_920, 2_880, 3_360,
    ]);
  });

  test("a whole-bar phase-1 chord is the near-solo bass bar", () => {
    /*
     * Bar 5 (E7#9): written measure index 5, phase 1 — the sparse bar the
     * reference's density variance demanded. One declared bass note; the
     * comp enters off the downbeat with the arrival statement added at 0.
     */
    const barStart = 5 * BAR_TICKS;
    expect(relativeAttacks(barStart, "bass")).toEqual([0]);
    expect(relativeAttacks(barStart, "comp")).toEqual([
      0, 960, 1_440, 1_920, 2_400, 3_360,
    ]);
  });

  test("every pre-barline attack releases before the next downbeat", () => {
    /*
     * Attacks at relative 3360 may declare up to 600 ticks; the clipping
     * law releases them against the next bar's own downbeat statement, so
     * nothing smears across the barline.
     */
    const pickups = performance.events.filter(
      (event) => event.startTick % BAR_TICKS === 3_360,
    );
    expect(pickups.length).toBeGreaterThan(0);
    for (const event of pickups) {
      expect(event.durationTicks).toBeLessThanOrEqual(450);
      expect(event.durationTicks).toBeGreaterThan(0);
    }
  });

  test("no same-role attacks collide, and only the pedal bar fills its bar", () => {
    const seen = new Set<string>();
    for (const event of performance.events) {
      const key = `${roleOf(event.eventId)}@${String(event.startTick)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    for (let bar = 0; bar < 6; bar += 1) {
      for (const role of ["bass", "comp"] as const) {
        const sounding = performance.events
          .filter(
            (event) =>
              roleOf(event.eventId) === role &&
              event.startTick >= bar * BAR_TICKS &&
              event.startTick < (bar + 1) * BAR_TICKS,
          )
          .reduce((sum, event) => sum + event.durationTicks, 0);
        expect(sounding).toBeGreaterThan(0);
        /*
         * The pedal bar (phase 3, written bar 3) holds its chord to the
         * bar's edge less the release gap; every other bar rests.
         */
        if (role === "comp" && bar % 4 === 3) {
          expect(sounding).toBeGreaterThan(3_000);
          expect(sounding).toBeLessThanOrEqual(BAR_TICKS);
        } else {
          expect(sounding).toBeLessThan(BAR_TICKS);
        }
      }
    }
  });

  test("this style alone declares a bass register and the thin voicings: the negative control", () => {
    /*
     * The sub-eighth negative control died with the sub-eighth claim. What
     * distinguishes the measured style now is structural: the four-phase
     * cycle with a pedal bar, the per-style electric-bass register, and
     * the thin right-hand voicings. None of them may leak into another
     * style unnoticed.
     */
    for (const styleId of OTHER_BAND_SKETCHES) {
      const other = PERFORMANCE_STYLES[styleId];
      expect(`${styleId}:${String(other.bassRegister === null)}`).toBe(
        `${styleId}:true`,
      );
      const thin = other.compSlots.filter(
        (slot) => slot.voicing === "top-voice" || slot.voicing === "guide-tones",
      );
      expect(`${styleId}:${String(thin.length)}`).toBe(`${styleId}:0`);
    }
    const ownThin = PERFORMANCE_STYLES[STYLE_ID].compSlots.filter(
      (slot) => slot.voicing === "top-voice" || slot.voicing === "guide-tones",
    );
    expect(ownThin.length).toBeGreaterThan(0);
  });
});

describe("the owner-directed chart under its own groove", () => {
  const entry = PROGRESSION_LIBRARY.find(
    (candidate) => candidate.id === "what-a-fool-believes",
  );

  test("names the sixteenth style and compiles through the production plan path", () => {
    if (entry === undefined) throw new Error("SIXTEENTHS_TEST_ENTRY_MISSING");
    expect(entry.grooveStyleId).toBe(STYLE_ID);
    const literal = literalPlanOf(
      publishedChart(entry.chartText, "document-what-a-fool-believes"),
    );
    const performance = performedBy(literal, STYLE_ID);
    /* A performance, not a pad: strictly more attacks than written chords. */
    expect(performance.events.length).toBeGreaterThan(literal.events.length);
    /* Both roles sound: the sketch carries bass and comp for this chart. */
    const roles = new Set(performance.events.map((event) => roleOf(event.eventId)));
    expect(roles.has("bass")).toBe(true);
    expect(roles.has("comp")).toBe(true);
  });
});

describe("the groove vocabulary after the sixth id", () => {
  test("every storable groove decodes, the default only as absence", () => {
    /*
     * The decoder names the vocabulary in literal equalities (the F2 source
     * policy forbids lookups through imported tuples), so this sweep is the
     * law that keeps that chain equal to GROOVE_STYLE_IDS: a tuple member
     * the chain forgot cannot decode and fails here — the exact defect that
     * would silently break recovery for documents storing the new groove.
     */
    for (const [index, grooveStyleId] of GROOVE_STYLE_IDS.entries()) {
      const decoded = decodeDocumentShape(
        candidateFor("| Dbmaj7 |", `document-groove-${String(index)}`, grooveStyleId),
      );
      if (grooveStyleId === DEFAULT_GROOVE_STYLE_ID) {
        expect(decoded.ok).toBe(false);
        if (!decoded.ok) {
          expect(decoded.errors[0].code).toBe(
            "playback.groove_style_not_canonical",
          );
        }
        continue;
      }
      expect(`${grooveStyleId}:${String(decoded.ok)}`).toBe(
        `${grooveStyleId}:true`,
      );
      if (decoded.ok) {
        expect(decoded.value.playback.grooveStyleId).toBe(grooveStyleId);
      }
    }
    /* A near-miss id still refuses: the vocabulary stays closed. */
    const unknown = decodeDocumentShape(
      candidateFor("| Dbmaj7 |", "document-groove-unknown", "syncopated-sixteenths@2"),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.errors[0].code).toBe("playback.groove_style_invalid");
    }
  });
});
