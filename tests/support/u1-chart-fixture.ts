import {
  createInitialAppState,
  createStudioApplicationDependencies,
  createStudioControllerOverState,
  STUDIO_INITIAL_PANELS,
  validateDocumentSemantics,
  type StudioController,
} from "../../src/application";
import {
  decodeDocumentShape,
  makeBeatPosition,
  PROGRESSION_DOCUMENT_SCHEMA,
} from "../../src/domain";

/**
 * Author a real chart the studio controller can host.
 *
 * The studio's own quick entry can only ever produce Auto voicings and can
 * only grow a chart one publication at a time, so two families of reviewed
 * rows are unreachable through it: the ones that need a Manual or Frozen
 * voicing (`U1-OPC-036`, `U1-OPC-037`) and the ones that need a chart at the
 * exact document capacity (`U1-OPC-050`). Both are ordinary *document* facts,
 * not U2 operations — a chart that already carries stored pitches is exactly
 * what a user reopens — so this builds the candidate document and publishes it
 * through the same real F2 decode and F3 semantic boundary the product uses.
 *
 * Nothing here bypasses a boundary: a candidate that F2 or F3 refuses is
 * reported as a refusal rather than forced into the controller.
 */

export type U1FixtureRefusal = Readonly<{ ok: false; reason: string }>;

export type U1FixtureVoicingMode = "auto" | "manual" | "frozen";

export type U1FixtureEvent = Readonly<{
  id: string;
  /** Exact beat duration in quarter notes. */
  duration: Readonly<{ numerator: number; denominator: number }>;
  voicingMode: U1FixtureVoicingMode;
  annotation?: string;
  sourceText?: string;
}>;

export type U1FixtureMeasure = Readonly<{
  id: string;
  events: readonly U1FixtureEvent[];
  /** Omitted means "derive `empty` or `complete` from the events". */
  completion?: Readonly<{
    kind: "incomplete" | "pickup";
    expectedDuration: Readonly<{ numerator: number; denominator: number }>;
    reason: string;
  }>;
}>;

export type U1FixtureSection = Readonly<{
  id: string;
  name: string;
  measures: readonly U1FixtureMeasure[];
}>;

export type U1FixtureChart = Readonly<{
  documentId?: string;
  title?: string;
  meter?: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  sections: readonly U1FixtureSection[];
}>;

const CMAJ7_SPEC = Object.freeze({
  kind: "parsed",
  sourceText: "Cmaj7",
  root: Object.freeze({ step: "C", alter: 0 }),
  triad: "major",
  sixth: null,
  seventh: "major",
  extensions: Object.freeze([]),
  additions: Object.freeze([]),
  alterations: Object.freeze([]),
  omissions: Object.freeze([]),
  bass: null,
  colorPolicy: "none",
});

const AUTO_VOICING = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

/** Exact stored pitches. Order, spelling, octave, and doubling are authoritative. */
const STORED_PITCHES = Object.freeze([
  Object.freeze({ step: "C", alter: 0, octave: 4 }),
  Object.freeze({ step: "E", alter: 0, octave: 4 }),
  Object.freeze({ step: "G", alter: 0, octave: 4 }),
  Object.freeze({ step: "B", alter: 0, octave: 4 }),
]);

const MANUAL_VOICING = Object.freeze({
  mode: "manual",
  pitches: STORED_PITCHES,
  bassPolicy: "included",
});

const FROZEN_VOICING = Object.freeze({
  mode: "frozen",
  pitches: STORED_PITCHES,
  bassPolicy: "included",
  generatedBy: Object.freeze({ engineVersion: "v0.1", family: "balanced" }),
});

function voicingFor(mode: U1FixtureVoicingMode): unknown {
  if (mode === "manual") return MANUAL_VOICING;
  if (mode === "frozen") return FROZEN_VOICING;
  return AUTO_VOICING;
}

function eventCandidate(event: U1FixtureEvent): unknown {
  return Object.freeze({
    id: event.id,
    duration: Object.freeze({ ...event.duration }),
    annotation: event.annotation ?? "",
    chord: Object.freeze({
      ...CMAJ7_SPEC,
      sourceText: event.sourceText ?? CMAJ7_SPEC.sourceText,
    }),
    voicing: voicingFor(event.voicingMode),
  });
}

function measureCandidate(measure: U1FixtureMeasure): unknown {
  const completion =
    measure.completion !== undefined
      ? Object.freeze({
          kind: measure.completion.kind,
          expectedDuration: Object.freeze({ ...measure.completion.expectedDuration }),
          reason: measure.completion.reason,
        })
      : Object.freeze({
          kind: measure.events.length === 0 ? "empty" : "complete",
        });
  return Object.freeze({
    id: measure.id,
    events: Object.freeze(measure.events.map(eventCandidate)),
    completion,
  });
}

/** The candidate wire document; still untrusted until F2 and F3 accept it. */
export function u1ChartCandidate(chart: U1FixtureChart): unknown {
  return Object.freeze({
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: chart.documentId ?? "studio-document-1",
    title: chart.title ?? "U1 fixture chart",
    description: "",
    meter: Object.freeze({ ...(chart.meter ?? { beatsPerBar: 4, beatUnit: 4 }) }),
    tempoBpm: 120,
    key: null,
    sections: Object.freeze(
      chart.sections.map((section) =>
        Object.freeze({
          id: section.id,
          name: section.name,
          annotation: "",
          keyOverride: null,
          voiceLeadingBoundary: "reset",
          measures: Object.freeze(section.measures.map(measureCandidate)),
        }),
      ),
    ),
    playback: Object.freeze({
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.25,
      countInBars: 0,
    }),
  });
}

export type U1FixtureControllerResult =
  | Readonly<{ ok: true; controller: StudioController }>
  | U1FixtureRefusal;

/**
 * Publish a candidate document through the real F2/F3 boundary and host it on
 * the real studio controller with a deterministic logical clock.
 */
export function u1ControllerOverChart(
  chart: U1FixtureChart,
): U1FixtureControllerResult {
  const decoded = decodeDocumentShape(u1ChartCandidate(chart));
  if (!decoded.ok) {
    return Object.freeze({ ok: false as const, reason: "fixture-structure-refused" });
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    return Object.freeze({ ok: false as const, reason: "fixture-semantics-refused" });
  }
  const zeroBeat = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zeroBeat.ok) {
    return Object.freeze({ ok: false as const, reason: "fixture-zero-beat-refused" });
  }
  const initialized = createInitialAppState({
    document: published.value,
    zeroBeat: zeroBeat.value,
    initialPanels: STUDIO_INITIAL_PANELS,
  });
  if (!initialized.ok) {
    return Object.freeze({ ok: false as const, reason: "fixture-initial-state-refused" });
  }
  let ticks = 0;
  return Object.freeze({
    controller: createStudioControllerOverState(
      initialized.state,
      createStudioApplicationDependencies(),
      {
        nowMs: () => {
          ticks += 2_000;
          return ticks;
        },
      },
    ),
    ok: true as const,
  });
}

/** Throwing form for tests whose subject is not the publication itself. */
export function u1ControllerOverChartOrThrow(
  chart: U1FixtureChart,
): StudioController {
  const created = u1ControllerOverChart(chart);
  if (!created.ok) throw new Error(`U1_FIXTURE:${created.reason}`);
  return created.controller;
}

/**
 * A chart holding exactly `eventCount` chord events in complete 4/4 bars.
 *
 * Eight eighth-note events fill one 4/4 bar exactly, so the domain's own two
 * ceilings — 1,024 measures per section and 8,192 chord events per document —
 * are reached together at the document capacity.
 */
export function u1SaturatedChart(eventCount: number): U1FixtureChart {
  const eighth = Object.freeze({ numerator: 1, denominator: 2 });
  const perMeasure = 8;
  const measures: U1FixtureMeasure[] = [];
  let created = 0;
  let measureIndex = 0;
  while (created < eventCount) {
    const take = Math.min(perMeasure, eventCount - created);
    const events: U1FixtureEvent[] = [];
    for (let index = 0; index < take; index += 1) {
      events.push({
        duration: eighth,
        id: `fixture-event-${String(created + index + 1)}`,
        voicingMode: "auto",
      });
    }
    measures.push(
      take === perMeasure
        ? { events, id: `fixture-measure-${String(measureIndex + 1)}` }
        : {
            completion: {
              expectedDuration: { denominator: 2, numerator: take },
              kind: "incomplete",
              reason: "Saturation fixture tail bar",
            },
            events,
            id: `fixture-measure-${String(measureIndex + 1)}`,
          },
    );
    created += take;
    measureIndex += 1;
  }
  return {
    sections: [{ id: "fixture-section-a", measures, name: "A" }],
    title: "U1 saturation chart",
  };
}
