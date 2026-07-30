/**
 * The style catalogue's own laws (groove expansion, 2026-07-30).
 *
 * The per-style structural laws in performance-plan.test.ts already sweep
 * every declared band-sketch style; what they cannot state is that the
 * catalogue's styles are DIFFERENT PERFORMANCES of the same chart. A picker
 * offering five names that render the same onsets would be a lie with a
 * radio group in front of it, so the distinctness law lives here, computed
 * from the compiled plans themselves.
 */
import { describe, expect, test } from "bun:test";

import { STARTER_CHART } from "../../src/application/studio-starter-chart";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { validateDocumentSemantics } from "../../src/application";
import {
  decodeDocumentShape,
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

const BAND_SKETCH_IDS = PERFORMANCE_STYLE_IDS.filter(
  (id) => PERFORMANCE_STYLES[id].kind === "band-sketch",
);

/* The exact Auto voicing the studio's quick-entry path assigns. */
const AUTO_BALANCED = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

function publishedChart(): ValidatedDocument {
  const parsed = parseChartText(
    STARTER_CHART.chartText,
    { meter: { beatsPerBar: 4, beatUnit: 4 }, mode: "fragment" },
    "ascii",
  );
  if (!parsed.ok) throw new Error("CATALOG_TEST_T0");
  let eventOrdinal = 0;
  const candidate = {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: "document-style-catalog",
    title: "Style catalogue reference",
    description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 105,
    key: null,
    sections: parsed.draft.sections.map((section, sectionIndex) => ({
      id: `section-catalog-${String(sectionIndex)}`,
      name: "A",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: section.measures.map((measure, measureIndex) => ({
        id: `measure-catalog-${String(measureIndex)}`,
        events: measure.events.map((event) => {
          eventOrdinal += 1;
          return {
            id: `event-catalog-${String(eventOrdinal)}`,
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
    },
  };
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) {
    throw new Error(`CATALOG_TEST_F2:${decoded.errors[0].code}`);
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(`CATALOG_TEST_F3:${published.errors[0].code}`);
  }
  return published.value;
}

let literalCache: PlaybackPlan | null = null;
function literalPlan(): PlaybackPlan {
  if (literalCache === null) {
    const compiled = compileStudioPlaybackPlan(publishedChart());
    if (!compiled.ok) throw new Error("CATALOG_TEST_P0");
    literalCache = compiled.plan;
  }
  return literalCache;
}

function performedBy(styleId: PerformanceStyleId): PlaybackPlan {
  const result = compilePerformancePlan({ plan: literalPlan(), styleId });
  if (!result.ok) throw new Error(`CATALOG_TEST_COMPILE:${styleId}`);
  return result.plan;
}

/** The multiset of onset ticks, as a canonical sorted string. */
function onsetSignature(plan: PlaybackPlan): string {
  return plan.events
    .map((event) => Number(event.startTick))
    .sort((left, right) => left - right)
    .join(",");
}

describe("the style catalogue", () => {
  test("every declared style compiles the reference chart", () => {
    for (const styleId of PERFORMANCE_STYLE_IDS) {
      const result = compilePerformancePlan({ plan: literalPlan(), styleId });
      expect(`${styleId}:${String(result.ok)}`).toBe(`${styleId}:true`);
    }
  });

  test("band-sketch styles are pairwise different performances", () => {
    const signatures = new Map<string, string>();
    for (const styleId of BAND_SKETCH_IDS) {
      signatures.set(styleId, onsetSignature(performedBy(styleId)));
    }
    const ids = [...signatures.keys()];
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const leftId = ids[left] ?? "";
        const rightId = ids[right] ?? "";
        expect(
          `${leftId}~${rightId}:${String(
            signatures.get(leftId) === signatures.get(rightId),
          )}`,
        ).toBe(`${leftId}~${rightId}:false`);
      }
    }
  });

  test("every band-sketch style is a different performance from the literal chart", () => {
    const literal = onsetSignature(literalPlan());
    for (const styleId of BAND_SKETCH_IDS) {
      expect(
        `${styleId}:${String(onsetSignature(performedBy(styleId)) === literal)}`,
      ).toBe(`${styleId}:false`);
    }
  });

  test("the identity style returns the literal plan byte-identically", () => {
    const result = compilePerformancePlan({
      plan: literalPlan(),
      styleId: "block-chords@1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("CATALOG_TEST_IDENTITY");
    expect(result.plan).toBe(literalPlan());
  });

  test("bass notes of every band-sketch style stay in the published bass register", () => {
    for (const styleId of BAND_SKETCH_IDS) {
      const plan = performedBy(styleId);
      let bassNotes = 0;
      for (const event of plan.events) {
        /* Performed ids end ".<role-suffix><ordinal>"; b is the bass role. */
        const eventId = String(event.eventId);
        const dot = eventId.lastIndexOf(".");
        if (dot < 0 || eventId.slice(dot + 1, dot + 2) !== "b") continue;
        bassNotes += 1;
        for (const midi of event.midiPitches) {
          expect(`${styleId}:${String(midi >= 28 && midi <= 48)}`).toBe(
            `${styleId}:true`,
          );
        }
      }
      /* A matcher that finds no bass at all is testing nothing. */
      expect(`${styleId}:${String(bassNotes > 0)}`).toBe(`${styleId}:true`);
    }
  });
});
