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
 * inversion of the sub-eighth law it replaces. The statistically
 * optimized table was then ALSO rejected by ear, and the owner directed
 * the final authority: the reference's own dominant bar patterns,
 * transcribed (the verse riff and the two-note resting bass vamp).
 * Aggregates average the whole song; the ear hears the figure.
 *
 * Every number below is authored HERE, from the campaign's answer-key
 * fixture (rounds/answer-key.json), never read back from the table it
 * checks — a table edit that changes the groove must turn this
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
 * durationTicks, velocity]. The verse vamp transcribed: root at beat 1,
 * the octave pair at the and-of-1 (register-floor drops it in two of the
 * three vamp phases, the third recovers upward), then SILENCE — the
 * reference's dominant bass bar is two notes and rest. Phase 3 is the
 * one active walk bar in four.
 */
const EXPECTED_BASS = {
  0: [
    [0, "root", "nearest", 420, 88],
    [480, "root", "register-floor", 360, 92],
  ],
  1: [
    [0, "root", "nearest", 420, 88],
    [480, "root", "nearest", 360, 92],
  ],
  2: [
    [0, "root", "nearest", 420, 88],
    [480, "root", "register-floor", 360, 92],
  ],
  3: [
    [0, "root", "nearest", 420, 92],
    [480, "root", "register-floor", 480, 84],
    [1_440, "root", "nearest", 480, 84],
    [2_400, "third", "nearest", 360, 78],
    [3_360, "root", "nearest", 360, 66],
  ],
} as const;

/**
 * The four-phase comp, per phase: [offsetTicks, voicing, durationTicks,
 * velocity]. THE riff, transcribed: beat 1, and-of-1 (soft), beat 2,
 * and-of-2, then the lone and-of-3 — third-beat stabs with the measured
 * accent contour — in phases 0, 2 and 3; phase 1 is the alternation bar
 * (1, and-1, 2, 3, 4). The guide-tones at the and-of-1 are the soft
 * inner answer; the arrival floor widens any thin voicing landing on a
 * chord's own start.
 */
const EXPECTED_COMP = {
  0: [
    [0, "upper-voices", 320, 89],
    [480, "guide-tones", 320, 63],
    [960, "upper-voices", 320, 80],
    [1_440, "upper-voices", 320, 87],
    [2_400, "upper-voices", 320, 90],
  ],
  1: [
    [0, "upper-voices", 360, 85],
    [480, "guide-tones", 320, 72],
    [960, "upper-voices", 360, 87],
    [1_920, "upper-voices", 360, 89],
    [2_880, "upper-voices", 360, 90],
  ],
  2: [
    [0, "upper-voices", 320, 89],
    [480, "guide-tones", 320, 63],
    [960, "upper-voices", 320, 80],
    [1_440, "upper-voices", 320, 87],
    [2_400, "upper-voices", 320, 90],
  ],
  3: [
    [0, "upper-voices", 320, 86],
    [480, "guide-tones", 320, 60],
    [960, "upper-voices", 320, 77],
    [1_440, "upper-voices", 320, 84],
    [2_400, "upper-voices", 320, 87],
  ],
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
    expect(style.bassSlots.length).toBe(11);
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
    expect(style.compSlots.length).toBe(20);
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
    expect(style.compRegister).toEqual({ lowMidi: 53, highMidi: 76, ceilingMidi: 79 });
    /*
     * The per-style bass register is the field this campaign added: the
     * reference bass lives at MIDI 41..61, an octave above the package's
     * jazz register, and no other style may be detuned to reach it.
     */
    expect(style.bassRegister).toEqual({ lowMidi: 41, highMidi: 61, anchorMidi: 54 });
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

  test("a whole-bar phase-0 chord states the riff bar exactly", () => {
    /* Bar 4 (Ebmaj7): written measure index 4, phase 0 - THE riff. */
    const barStart = 4 * BAR_TICKS;
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 480]);
    expect(relativeAttacks(barStart, "comp")).toEqual([
      0, 480, 960, 1_440, 2_400,
    ]);
  });

  test("a whole-bar phase-1 chord is the alternation bar", () => {
    /* Bar 5 (E7#9): written measure index 5, phase 1. */
    const barStart = 5 * BAR_TICKS;
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 480]);
    expect(relativeAttacks(barStart, "comp")).toEqual([
      0, 480, 960, 1_920, 2_880,
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

  test("no same-role attacks collide, and both roles rest in every bar", () => {
    const seen = new Set<string>();
    for (const event of performance.events) {
      const key = `${roleOf(event.eventId)}@${String(event.startTick)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    /*
     * The transcribed vamp is rest-heavy by construction: the bass
     * sounds under a beat per bar in the vamp phases and the comp's
     * stabs clear well before the barline. Silence is the figure's
     * other half.
     */
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
        expect(sounding).toBeLessThan(BAR_TICKS);
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
