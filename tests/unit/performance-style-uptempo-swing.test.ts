/**
 * The uptempo-swing@1 style table's own laws — an AUTHORED sketch, not a
 * measured campaign (owner-directed Giant Steps entry, 2026-08-06).
 *
 * WHY AUTHORED. The idiom's reference recordings are protected works this
 * project has no license to measure against, and the fast-swing division of
 * labour the table sketches — a two-feel bass, sparse stabs, lightened swing
 * eighths — is the idiom's documented practice, stated in the contract's doc
 * comment. Every number below is authored HERE, independently of the table
 * it checks: a table edit that changes the groove must turn this file red.
 * Green gates still never prove a groove sounds right; the owner's ear
 * remains the final gate.
 *
 * THE SHAPE, in ticks (PPQ 960; a beat is 960, an eighth 480):
 *  - BASS anchors at 0 and 1920 in BOTH phases — the two-feel — each 1824
 *    ticks long so each releases 96 ticks before the next anchor attacks.
 *    Phase 1 alone adds the pickup at 3360 (the and-of-4), 240 ticks, swung
 *    by the ratio to 3456 by the compiler.
 *  - COMP stabs: the and-of-2 (1440, swung) in every phase, 432 ticks, and
 *    the beat-4 answer (2880, 432 ticks, softer) in phase 1 only.
 *  - SWING RATIO 3/5: the only ratio in the package that is neither straight
 *    (1/2) nor full triplet (2/3) — fast swing eighths lighten toward
 *    straight, and this is the law that says so.
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
/* Independently authored expectations (PPQ 960; a beat is 960).       */
/* ------------------------------------------------------------------ */

const STYLE_ID = "uptempo-swing@1" as const;
const BAR_TICKS = 3_840;

/**
 * The two-phase bass, per phase: [offsetTicks, tone, placement,
 * durationTicks, velocity]. The two-feel: root on beat 1, fifth on beat 3,
 * both held 19/10 of a beat; the answer bar alone adds the third-tone
 * pickup on the and-of-4.
 */
const EXPECTED_BASS = {
  0: [
    [0, "root", "nearest", 1_824, 94],
    [1_920, "fifth", "nearest", 1_824, 86],
  ],
  1: [
    [0, "root", "nearest", 1_824, 94],
    [1_920, "fifth", "nearest", 1_824, 86],
    [3_360, "third", "nearest", 240, 78],
  ],
} as const;

/**
 * The two-phase comp, per phase: [offsetTicks, voicing, durationTicks,
 * velocity]. Sparse by design: the and-of-2 stab in every bar, the beat-4
 * answer in the answer bar only.
 */
const EXPECTED_COMP = {
  0: [[1_440, "upper-voices", 432, 78]],
  1: [
    [1_440, "upper-voices", 432, 78],
    [2_880, "upper-voices", 432, 70],
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
  if (!parsed.ok) throw new Error("UPTERMO_TEST_T0");
  let eventOrdinal = 0;
  return {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: documentId,
    title: "Uptempo reference",
    description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 290,
    key: null,
    sections: parsed.draft.sections.map((section, sectionIndex) => ({
      id: `section-uptempo-${String(sectionIndex)}`,
      name: "A",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: section.measures.map((measure, measureIndex) => ({
        id: `measure-uptempo-${String(measureIndex)}`,
        events: measure.events.map((event) => {
          eventOrdinal += 1;
          return {
            id: `event-uptempo-${String(eventOrdinal)}`,
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
    throw new Error(`UPTERMO_TEST_F2:${decoded.errors[0].code}`);
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(`UPTERMO_TEST_F3:${published.errors[0].code}`);
  }
  return published.value;
}

function literalPlanOf(document: ValidatedDocument): PlaybackPlan {
  const compiled = compileStudioPlaybackPlan(document);
  if (!compiled.ok) throw new Error("UPTERMO_TEST_P0");
  return compiled.plan;
}

function performedBy(plan: PlaybackPlan, styleId: PerformanceStyleId): PlaybackPlan {
  const result = compilePerformancePlan({ plan, styleId });
  if (!result.ok) {
    throw new Error(`UPTERMO_TEST_COMPILE:${styleId}:${result.refusal.code}`);
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

describe("the uptempo-swing style table", () => {
  const style = PERFORMANCE_STYLES[STYLE_ID];

  test("declares the two-feel bass, slot for slot", () => {
    expect(style.kind).toBe("band-sketch");
    expect(style.meter).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(style.barCycleLength).toBe(2);
    expect([...style.barCycleVelocityOffsets]).toEqual([0, -3]);
    expect(style.swingRatio).toEqual({ numerator: 3, denominator: 5 });

    for (const phase of [0, 1] as const) {
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
    expect(style.bassSlots.length).toBe(3);
  });

  test("declares the sparse comp, statement and answer", () => {
    for (const phase of [0, 1] as const) {
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
    expect(style.compSlots.length).toBe(2);
  });

  test("walks nowhere: no bass anchor on beat 2 or beat 4 of any phase", () => {
    /*
     * The two-feel is the style's reason to exist: past ~240 BPM a walking
     * four turns to mud. A table that grows a beat-2 or beat-4 bass slot —
     * or any slot outside {0, 2} plus the answer bar's and-of-4 pickup —
     * has stopped being a two-feel and must fail here.
     */
    for (const slot of style.bassSlots) {
      const offset = ticksToBeats(slot.offsetBeats);
      const legal =
        offset === 0 || offset === 1_920 || offset === 3_360;
      expect(`${String(offset)}:${String(legal)}`).toBe(
        `${String(offset)}:true`,
      );
    }
  });

  test("keeps the balance law and the sparseness claim", () => {
    const loudestBass = Math.max(...style.bassSlots.map((slot) => slot.velocity));
    const loudestComp = Math.max(...style.compSlots.map((slot) => slot.velocity));
    expect(loudestComp).toBeLessThan(loudestBass);
    /* At most two declared comp hits in either phase: sparse by design. */
    for (const phase of [0, 1] as const) {
      const hits = style.compSlots.filter((slot) =>
        slot.cyclePhases.includes(phase),
      );
      expect(hits.length).toBeLessThanOrEqual(2);
    }
  });

  test("declares the fast-swing registers and no bass override", () => {
    expect(style.compRegister).toEqual({ lowMidi: 62, highMidi: 85, ceilingMidi: 90 });
    /* An acoustic bass at these tempos sits in the package-wide window. */
    expect(style.bassRegister).toBeNull();
  });

  test("is the only style whose offbeat eighths are neither straight nor triplet", () => {
    /*
     * The negative control: every other band sketch plays its offbeat
     * eighths straight (1/2). The lightened 3/5 is this style's alone; if
     * another table ever declares it, one of the two is a duplicate idiom
     * wearing a different name.
     */
    for (const other of OTHER_BAND_SKETCHES) {
      const ratio = PERFORMANCE_STYLES[other].swingRatio;
      expect(`${other}:${String(ratio.numerator)}/${String(ratio.denominator)}`).toBe(
        `${other}:1/2`,
      );
    }
    expect(style.swingRatio).toEqual({ numerator: 3, denominator: 5 });
  });
});

describe("the compiled fast groove", () => {
  /* The seeded chart: bars 0-3 carry two chords, bars 4-5 one whole-bar chord. */
  const literal = literalPlanOf(
    publishedChart(STARTER_CHART.chartText, "document-uptempo-reference"),
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

  test("a whole-bar phase-0 chord states the two-feel and one swung stab", () => {
    /* Bar 4 (Ebmaj7): written measure index 4, phase 0. */
    const barStart = 4 * BAR_TICKS;
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 1_920]);
    /* 1440 swung by 3/5 lands at 1536; the arrival states the chord at 0. */
    expect(relativeAttacks(barStart, "comp")).toEqual([0, 1_536]);
  });

  test("a whole-bar phase-1 chord adds the pickup and the beat-4 answer", () => {
    /* Bar 5 (E7#9): written measure index 5, phase 1. */
    const barStart = 5 * BAR_TICKS;
    /* The and-of-4 pickup swung by 3/5 lands at 3456. */
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 1_920, 3_456]);
    expect(relativeAttacks(barStart, "comp")).toEqual([0, 1_536, 2_880]);
  });

  test("a two-chord phase-0 bar states both chords and nothing else", () => {
    /* Bar 0 (Cmaj7 | Bm7#5): the mid-bar arrival states the second chord. */
    const barStart = 0;
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 1_920]);
    expect(relativeAttacks(barStart, "comp")).toEqual([0, 1_536, 1_920]);
  });

  test("a two-chord phase-1 bar carries the answer figure over both chords", () => {
    /* Bar 1 (Bbmaj7 | Am7#5), phase 1. */
    const barStart = BAR_TICKS;
    expect(relativeAttacks(barStart, "bass")).toEqual([0, 1_920, 3_456]);
    expect(relativeAttacks(barStart, "comp")).toEqual([0, 1_536, 1_920, 2_880]);
  });

  test("the swung pickup releases inside its own bar", () => {
    /*
     * The pickup declares 240 ticks at 3456; the barline sits at 3840, so
     * the clipping law never needs to shorten it — but this is the law
     * that says so, not the table's good fortune.
     */
    const pickups = performance.events.filter(
      (event) => event.startTick % BAR_TICKS === 3_456,
    );
    expect(pickups.length).toBeGreaterThan(0);
    for (const event of pickups) {
      expect(event.durationTicks).toBeLessThanOrEqual(240);
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
    /* A two-feel with sparse stabs rests most of every bar, by design. */
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
});

describe("the owner-directed chart under its own groove", () => {
  const entry = PROGRESSION_LIBRARY.find(
    (candidate) => candidate.id === "giant-steps",
  );

  test("names the uptempo style and compiles through the production plan path", () => {
    if (entry === undefined) throw new Error("UPTERMO_TEST_ENTRY_MISSING");
    expect(entry.grooveStyleId).toBe(STYLE_ID);
    const literal = literalPlanOf(
      publishedChart(entry.chartText, "document-giant-steps"),
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

describe("the groove vocabulary after the seventh id", () => {
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
      candidateFor("| Dbmaj7 |", "document-groove-unknown", "uptempo-swing@2"),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.errors[0].code).toBe("playback.groove_style_invalid");
    }
  });
});
