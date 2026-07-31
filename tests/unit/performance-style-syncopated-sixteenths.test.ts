/**
 * The syncopated-sixteenths@1 style table's own laws (owner-directed
 * What a Fool Believes landing, 2026-07-31).
 *
 * Green gates never prove a groove sounds right — that lesson is the Deacon
 * Blues one and it is not forgotten here. What this suite CAN do is freeze
 * the rhythmic identity the style claims, as independently written fixture
 * expectations over the table and over real compiled plans: the sixteenth
 * grid, the pushes into beats 2 and 4, the cross-barline anticipations, the
 * and-of-2 bass syncopation, the statement/answer two-bar figure, and the
 * rest structure. Every number below is authored HERE, from the style's
 * design record, never read back from the table it checks — a table edit
 * that changes the groove must turn this file red.
 *
 * The negative half is structural: the sub-eighth attack positions are
 * proven to exist in NO other declared style's compiled output, so the
 * claim "the catalogue's first sixteenth-note groove" is falsifiable, and
 * the anticipation offsets are proven off the eighth grid so a mutation
 * that quantizes them to the beat cannot stay green.
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
/* Independently authored expectations (PPQ 960; a sixteenth is 240). */
/* ------------------------------------------------------------------ */

const STYLE_ID = "syncopated-sixteenths@1" as const;
const BAR_TICKS = 3_840;
const SIXTEENTH = 240;

/** Declared bass slots: [offsetTicks, tone, durationTicks, velocity]. */
const EXPECTED_BASS_SLOTS = [
  [0, "root", 1_440, 92],
  [1_440, "root", 456, 84],
  [2_400, "fifth", 456, 80],
  [3_600, "root", 240, 86],
] as const;

/** Declared phase-0 comp slots: [offsetTicks, voicing, durationTicks, velocity]. */
const EXPECTED_COMP_PHASE0 = [
  [0, "all", 720, 86],
  [720, "upper-voices", 480, 74],
  [1_920, "all", 720, 82],
  [2_640, "upper-voices", 480, 72],
] as const;

/** Declared phase-1 comp slots: same shape. */
const EXPECTED_COMP_PHASE1 = [
  [0, "all", 720, 86],
  [720, "upper-voices", 480, 74],
  [1_440, "upper-voices", 480, 70],
  [2_400, "upper-voices", 480, 72],
  [3_600, "upper-voices", 480, 78],
] as const;

/**
 * The attack positions that sit on the sixteenth grid but OFF the eighth
 * grid — the style's whole identity. 720 pushes beat 2, 2640 pushes beat 4,
 * 3600 anticipates the next bar's downbeat.
 */
const SUB_EIGHTH_ATTACKS = [720, 2_640, 3_600] as const;

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

/** Map each emitted event to its written bar's start tick, via the literal plan. */
function barStartsByMeasure(literal: PlaybackPlan): Map<string, number> {
  const starts = new Map<string, number>();
  for (const event of literal.events) {
    const known = starts.get(event.measureId);
    if (known === undefined || event.startTick < known) {
      starts.set(event.measureId, event.startTick);
    }
  }
  return starts;
}

function ticksToBeats(offset: Readonly<{ numerator: number; denominator: number }>): number {
  return (offset.numerator * 960) / offset.denominator;
}

/* ------------------------------------------------------------- the laws */

describe("the syncopated-sixteenths style table", () => {
  const style = PERFORMANCE_STYLES[STYLE_ID];

  test("declares exactly the authored bass pattern, in both phases", () => {
    expect(style.kind).toBe("band-sketch");
    expect(style.meter).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(style.barCycleLength).toBe(2);
    expect([...style.barCycleVelocityOffsets]).toEqual([0, -3]);
    /* Straight: the sixteenth feel is written into WHERE attacks fall. */
    expect(style.swingRatio).toEqual({ numerator: 1, denominator: 2 });

    expect(
      style.bassSlots.map((slot) => [
        ticksToBeats(slot.offsetBeats),
        slot.tone,
        ticksToBeats(slot.durationBeats),
        slot.velocity,
      ]),
    ).toEqual(EXPECTED_BASS_SLOTS.map((row) => [...row]));
    /* The bass is an ostinato: every slot sounds in BOTH phases. */
    for (const slot of style.bassSlots) {
      expect([...slot.cyclePhases]).toEqual([0, 1]);
      expect(slot.placement).toBe("nearest");
    }
  });

  test("declares the statement/answer comp figure, phase by phase", () => {
    const phase = (wanted: number) =>
      style.compSlots
        .filter((slot) => slot.cyclePhases.includes(wanted))
        .map((slot) => [
          ticksToBeats(slot.offsetBeats),
          slot.voicing,
          ticksToBeats(slot.durationBeats),
          slot.velocity,
        ]);
    expect(phase(0)).toEqual(EXPECTED_COMP_PHASE0.map((row) => [...row]));
    expect(phase(1)).toEqual(EXPECTED_COMP_PHASE1.map((row) => [...row]));
    /* No comp slot straddles phases: the two bars are genuinely different. */
    for (const slot of style.compSlots) {
      expect(slot.cyclePhases.length).toBe(1);
    }
  });

  test("every offset is on the sixteenth grid, and the pushes are off the eighth grid", () => {
    const offsets = [...style.bassSlots, ...style.compSlots].map((slot) =>
      ticksToBeats(slot.offsetBeats),
    );
    for (const offset of offsets) {
      expect(offset % SIXTEENTH).toBe(0);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(BAR_TICKS);
    }
    /*
     * The anticipations sit a sixteenth BEFORE beats 2, 4 and the next
     * downbeat — off the eighth grid, which is what makes them pushes
     * rather than upbeats. A mutation that quantizes any of them to the
     * eighth grid changes this set and fails here.
     */
    const subEighth = [...new Set(offsets.filter((offset) => offset % 480 !== 0))]
      .sort((left, right) => left - right);
    expect(subEighth).toEqual([...SUB_EIGHTH_ATTACKS]);
    expect(subEighth.map((offset) => (offset + SIXTEENTH) % BAR_TICKS)).toEqual([
      960, 2_880, 0,
    ]);
  });

  test("keeps the syncopation ratio and the balance law", () => {
    /* Most comp attacks are off the quarter grid: 6 of the 9 declared. */
    const offQuarter = style.compSlots.filter(
      (slot) => ticksToBeats(slot.offsetBeats) % 960 !== 0,
    );
    expect(offQuarter.length).toBe(6);
    expect(style.compSlots.length).toBe(9);
    /* The loudest comp stays under the loudest bass, package-wide law. */
    const loudestComp = Math.max(...style.compSlots.map((slot) => slot.velocity));
    const loudestBass = Math.max(...style.bassSlots.map((slot) => slot.velocity));
    expect(loudestComp).toBeLessThan(loudestBass);
    /* Statements state the chord; pushes jab its top. */
    for (const slot of style.compSlots) {
      const offset = ticksToBeats(slot.offsetBeats);
      expect(slot.voicing).toBe(
        offset === 0 || offset === 1_920 ? "all" : "upper-voices",
      );
    }
  });

  test("declares the reviewed register between the pop keyboard and the bossa hand", () => {
    expect(style.compRegister).toEqual({ lowMidi: 49, highMidi: 72, ceilingMidi: 77 });
  });
});

describe("the compiled sixteenth groove", () => {
  /* The seeded chart: bars 0-3 carry two chords, bars 4-5 one whole-bar chord. */
  const literal = literalPlanOf(
    publishedChart(STARTER_CHART.chartText, "document-sixteenths-reference"),
  );
  const performance = performedBy(literal, STYLE_ID);
  const barStarts = barStartsByMeasure(literal);

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

  test("a whole-bar phase-0 chord states the authored figure exactly", () => {
    /* Bar 4 (Ebmaj7): written measure index 4, phase 0. */
    const barStart = 4 * BAR_TICKS;
    expect([...barStarts.values()]).toContain(barStart);
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 1_440, 2_400, 3_600]);
    expect(relativeAttacks(barStart, "comp")).toEqual([0, 720, 1_920, 2_640]);
  });

  test("a whole-bar phase-1 chord answers with the varied figure", () => {
    /* Bar 5 (E7#9): written measure index 5, phase 1. */
    const barStart = 5 * BAR_TICKS;
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 1_440, 2_400, 3_600]);
    expect(relativeAttacks(barStart, "comp")).toEqual([
      0, 720, 1_440, 2_400, 3_600,
    ]);
  });

  test("the cross-barline anticipations are clipped to real pickups", () => {
    /*
     * Every attack at relative 3600 releases before the next bar's own
     * downbeat statement: 240 declared ticks less the 30-tick release gap.
     */
    const pickups = performance.events.filter(
      (event) => event.startTick % BAR_TICKS === 3_600,
    );
    expect(pickups.length).toBeGreaterThan(0);
    for (const event of pickups) {
      expect(event.durationTicks).toBeLessThanOrEqual(210);
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

  test("no other declared style ever attacks off the eighth grid: the negative control", () => {
    /*
     * The sixteenth positions are this style's identity, so they must be
     * ABSENT from every other band sketch on the same chart. If a future
     * style legitimately adopts the sixteenth grid, this control is the
     * place that decision becomes visible.
     */
    for (const styleId of OTHER_BAND_SKETCHES) {
      const other = performedBy(literal, styleId);
      const offGrid = other.events.filter((event) => {
        const bar = Math.floor(event.startTick / BAR_TICKS);
        return (event.startTick - bar * BAR_TICKS) % 480 !== 0;
      });
      expect(`${styleId}:${String(offGrid.length)}`).toBe(`${styleId}:0`);
    }
    const own = performance.events.filter((event) => {
      const bar = Math.floor(event.startTick / BAR_TICKS);
      return (event.startTick - bar * BAR_TICKS) % 480 !== 0;
    });
    expect(own.length).toBeGreaterThan(0);
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
