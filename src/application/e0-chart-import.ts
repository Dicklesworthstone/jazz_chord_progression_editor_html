/**
 * E0 chart-text candidate builder (docs/E0_INTERCHANGE_CONTRACT.md
 * section 8.3; production build jcpe-milestone-reliable-studio-l3a.8.2).
 *
 * A successful T0 document-mode draft becomes a canonical v2 candidate
 * shape under the DISCLOSED defaults — nothing is invented beyond them:
 * title/description/tempo/key headers or their published fallbacks,
 * `Section ${sourceOrdinal + 1}` names for implicit sections, exact
 * parsed chord/duration/annotation, and the Balanced Auto four-voice
 * MIDI 48..84 generated-bass voicing on every event. Stable IDs come only
 * from the injected factory in structural preorder (document, then each
 * section, then each measure, then each event), the request budget is
 * checked before the factory is consulted at all, and a factory refusal
 * or duplicate is total — no partial candidate escapes. The complete
 * candidate still crosses F2/F3 downstream; this builder performs no
 * semantic validation of its own.
 */
import type {
  ChordEvent,
  MeasureShape,
  ProgressionDocumentShapeV2,
  SectionShape,
  StableIdFactory,
  StableIdFor,
  StableIdKind,
} from "../domain";
import { PROGRESSION_DOCUMENT_SCHEMA } from "../domain";
import type { ChartTextDraft } from "../theory";
import {
  CHART_IMPORT_DEFAULTS,
  MAX_E0_CHART_IMPORT_ID_REQUESTS,
  type BuildChartDocumentCandidate,
} from "./e0-interchange-contract";

type BuildRefusal =
  | Readonly<{
      ok: false;
      code: "limit.chart_import_id_requests_exceeded";
      path: readonly (string | number)[];
      received: 73_794;
      maximum: typeof MAX_E0_CHART_IMPORT_ID_REQUESTS;
    }>
  | Readonly<{
      ok: false;
      code: "import.chart_id_factory_failed" | "import.chart_id_collision";
      path: readonly (string | number)[];
    }>;

function factoryFailure(
  path: readonly (string | number)[],
): BuildRefusal {
  return Object.freeze({
    ok: false,
    code: "import.chart_id_factory_failed" as const,
    path: Object.freeze([...path]),
  });
}

export const buildChartDocumentCandidate: BuildChartDocumentCandidate = (
  draft: ChartTextDraft,
  idFactory: StableIdFactory,
) => {
  /*
   * Budget first: one document, one id per section, measure, and event.
   * The first request past the exact maximum refuses BEFORE the factory
   * is consulted again (contract: "stops before a 73,794th request").
   */
  let requests = 1;
  for (const section of draft.sections) {
    requests += 1;
    for (const measure of section.measures) {
      requests += 1 + measure.events.length;
    }
  }
  if (requests > MAX_E0_CHART_IMPORT_ID_REQUESTS) {
    return Object.freeze({
      ok: false,
      code: "limit.chart_import_id_requests_exceeded" as const,
      path: Object.freeze([]) as readonly (string | number)[],
      received: 73_794 as const,
      maximum: MAX_E0_CHART_IMPORT_ID_REQUESTS,
    });
  }

  const seen = new Set<string>();
  const allocate = <K extends StableIdKind>(
    kind: K,
    path: readonly (string | number)[],
  ): StableIdFor<K> | BuildRefusal => {
    const result = idFactory.next(kind);
    if (!result.ok) return factoryFailure(path);
    const value = result.value;
    if (seen.has(value)) {
      return Object.freeze({
        ok: false,
        code: "import.chart_id_collision" as const,
        path: Object.freeze([...path]),
      });
    }
    seen.add(value);
    return value;
  };

  const meter = draft.headers.meter;
  if (meter === null) {
    /*
     * Unreachable for a successful T0 DOCUMENT-mode parse — the grammar
     * requires @meter — but the header type is nullable and this builder
     * must stay total without throwing. The factory-failure envelope is
     * the defensive escape; it exposes no partial candidate.
     */
    return factoryFailure(Object.freeze(["headers", "meter"]));
  }

  const documentId = allocate("document", Object.freeze(["id"]));
  if (typeof documentId !== "string") return documentId;

  const sections: SectionShape[] = [];
  for (const [sectionIndex, source] of draft.sections.entries()) {
    const sectionPath = Object.freeze(["sections", sectionIndex, "id"]);
    const sectionId = allocate("section", sectionPath);
    if (typeof sectionId !== "string") return sectionId;

    const measures: MeasureShape[] = [];
    for (const [measureIndex, sourceMeasure] of source.measures.entries()) {
      const measurePath = Object.freeze([
        "sections",
        sectionIndex,
        "measures",
        measureIndex,
        "id",
      ]);
      const measureId = allocate("measure", measurePath);
      if (typeof measureId !== "string") return measureId;

      const events: ChordEvent[] = [];
      for (const [eventIndex, sourceEvent] of sourceMeasure.events.entries()) {
        const eventPath = Object.freeze([
          "sections",
          sectionIndex,
          "measures",
          measureIndex,
          "events",
          eventIndex,
          "id",
        ]);
        const eventId = allocate("event", eventPath);
        if (typeof eventId !== "string") return eventId;
        events.push(
          Object.freeze({
            id: eventId,
            duration: sourceEvent.duration,
            annotation: sourceEvent.annotation,
            chord: sourceEvent.chord,
            voicing: CHART_IMPORT_DEFAULTS.autoVoicing,
          }) as ChordEvent,
        );
      }

      measures.push(
        Object.freeze({
          id: measureId,
          events: Object.freeze(events),
          completion: Object.freeze(
            events.length === 0
              ? { kind: "empty" as const }
              : { kind: "complete" as const },
          ),
        }),
      );
    }

    sections.push(
      Object.freeze({
        id: sectionId,
        name:
          source.kind === "named" && source.name !== null
            ? source.name
            : `${CHART_IMPORT_DEFAULTS.sectionNamePrefix}${String(source.ordinal + 1)}`,
        annotation: source.annotation,
        keyOverride: CHART_IMPORT_DEFAULTS.sectionKeyOverride,
        voiceLeadingBoundary: CHART_IMPORT_DEFAULTS.sectionVoiceLeadingBoundary,
        measures: Object.freeze(measures),
      }),
    );
  }

  const candidate: ProgressionDocumentShapeV2 = Object.freeze({
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: documentId,
    title: draft.headers.title ?? CHART_IMPORT_DEFAULTS.title,
    description: draft.headers.description ?? CHART_IMPORT_DEFAULTS.description,
    meter,
    tempoBpm: draft.headers.tempoBpm ?? CHART_IMPORT_DEFAULTS.tempoBpm,
    key: draft.headers.key ?? CHART_IMPORT_DEFAULTS.key,
    sections: Object.freeze(sections),
    playback: CHART_IMPORT_DEFAULTS.playback,
  });

  return Object.freeze({ ok: true as const, value: candidate });
};
