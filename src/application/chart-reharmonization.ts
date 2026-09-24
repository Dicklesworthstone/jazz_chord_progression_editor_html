import {
  addBeatValues,
  makeBeatDuration,
  normalizeBeatValue,
  type BeatValue,
  type ChordEvent,
  type ChordEventId,
  type ParsedChordEvent,
  type ProgressionDocumentV2,
} from "../domain";
import {
  MAX_H1_TRANSFORM_EVENTS,
  evaluateTransformCandidates,
  parseChordSymbol,
  type TransformCandidate,
  type TransformLawFamily,
} from "../theory";

/**
 * "Reharmonize this chord": the H1 transform laws applied to a real chart.
 *
 * The laws read a flat event list and return edit plans; this module owns the
 * document side. It offers only the plans it can realize EXACTLY — a
 * one-chord replacement, or a split of one chord into exact halves where the
 * original keeps one half and a new chord (a related ii, its own dominant, a
 * passing diminished or a chromatic approach) takes the other — and builds the candidate document for A0's
 * `apply-reharmonization` command, which revalidates it independently.
 *
 * Manual and Frozen voicings are stored exact pitches; a new chord symbol
 * would contradict them, so those chords offer nothing rather than being
 * quietly re-voiced. Custom chords have no parsed identity to transform.
 */

export type ChartReharmonizationKind = "replace" | "split-insert";

export type ChartReharmonizationOption = Readonly<{
  id: string;
  lawId: string;
  family: TransformLawFamily;
  kind: ChartReharmonizationKind;
  title: string;
  explanation: string;
  /** The chords that sound in the target's time span before and after. */
  before: readonly string[];
  after: readonly string[];
}>;

export type ChartReharmonizationUnavailable =
  | "event-missing"
  | "custom-chord"
  | "stored-voicing"
  | "unreadable";

export type ChartReharmonizationList =
  | Readonly<{ ok: true; targetSymbol: string; options: readonly ChartReharmonizationOption[] }>
  | Readonly<{ ok: false; reason: ChartReharmonizationUnavailable }>;

export type ChartReharmonizationCandidate =
  | Readonly<{
      ok: true;
      option: ChartReharmonizationOption;
      /** Unvalidated: A0 validates it when the patch publishes. */
      candidate: ProgressionDocumentV2;
      changedIds: readonly string[];
      sourceEventIds: readonly ChordEventId[];
      exactTimingPreserved: boolean;
      /** The event whose place the listener should hear. */
      focusEventIds: readonly ChordEventId[];
    }>
  | Readonly<{ ok: false; reason: ChartReharmonizationUnavailable | "option-missing" | "unbuildable" }>;

type Located = Readonly<{
  event: ChordEvent;
  sectionIndex: number;
  measureIndex: number;
  eventIndex: number;
}>;

function locate(document: ProgressionDocumentV2, eventId: string): {
  timeline: readonly { event: ChordEvent; offset: BeatValue }[];
  index: number;
  at: Located | null;
} {
  const timeline: { event: ChordEvent; offset: BeatValue }[] = [];
  let at: Located | null = null;
  let index = -1;
  const zero = normalizeBeatValue({ numerator: 0, denominator: 1 });
  let offset: BeatValue | null = zero.ok ? zero.value : null;
  document.sections.forEach((section, sectionIndex) => {
    section.measures.forEach((measure, measureIndex) => {
      measure.events.forEach((event, eventIndex) => {
        if (offset === null) return;
        if (event.id === eventId) {
          at = { event, sectionIndex, measureIndex, eventIndex };
          index = timeline.length;
        }
        timeline.push({ event, offset });
        const next = addBeatValues(offset, event.duration);
        offset = next.ok ? next.value : null;
      });
    });
  });
  return { timeline, index, at };
}

/** Match the chart's own accidental glyphs: a ♭-spelled chart gets D♭7, not Db7. */
function inChartStyle(symbol: string, unicode: boolean): string {
  if (!unicode) return symbol;
  return symbol.replace(/^([A-G])(bb|b|##|#)?/, (_whole, step: string, accidental: string | undefined) =>
    step + (accidental ?? "").replace(/b/g, "♭").replace(/#/g, "♯"));
}

function realizable(
  candidate: TransformCandidate,
): ChartReharmonizationKind | null {
  const ops = candidate.editPlan.operations;
  if (ops.length === 1 && ops[0]?.kind === "replace") return "replace";
  // A split keeps the original chord in exactly one of its two halves.
  const keeps = ops.filter((op) => op.newSymbol === op.originalSymbol).length;
  if (
    ops.length === 2 &&
    ops[0]?.kind === "split" &&
    ops[1]?.kind === "insert" &&
    keeps === 1 &&
    candidate.editPlan.maintainsTimeBalance
  ) {
    return "split-insert";
  }
  return null;
}

function evaluate(document: ProgressionDocumentV2, eventId: string): Readonly<{
  ok: true;
  at: Located;
  unicode: boolean;
  options: readonly Readonly<{ option: ChartReharmonizationOption; candidate: TransformCandidate }>[];
}> | Readonly<{ ok: false; reason: ChartReharmonizationUnavailable }> {
  const { timeline, index, at } = locate(document, eventId);
  if (at === null || index < 0) return { ok: false, reason: "event-missing" };
  const located: Located = at;
  if (located.event.chord.kind !== "parsed") return { ok: false, reason: "custom-chord" };
  if (located.event.voicing.mode !== "auto") return { ok: false, reason: "stored-voicing" };
  // The laws see at most 64 events; a window around the target keeps its
  // neighbours, which are all any law reads.
  const start = Math.max(0, Math.min(index - 1, timeline.length - MAX_H1_TRANSFORM_EVENTS));
  const window = timeline.slice(start, start + MAX_H1_TRANSFORM_EVENTS);
  const unicode = /[♭♯]/.test(located.event.chord.sourceText);
  const result = evaluateTransformCandidates(
    window.map(({ event, offset }) => ({
      eventId: event.id,
      chordSymbol: event.chord.sourceText,
      offsetBeat: offset,
      duration: event.duration,
    })),
    index - start,
    { accidentalStyle: unicode ? "unicode" : "ascii" },
  );
  if (!result.ok) return { ok: false, reason: "unreadable" };
  const original = located.event.chord.sourceText;
  const options = result.candidates.flatMap((candidate) => {
    const kind = realizable(candidate);
    if (kind === null) return [];
    const ops = candidate.editPlan.operations;
    // The original keeps the chart's own text; a new chord is spelled in its style.
    const shown = ops.map((op) => (op.newSymbol === op.originalSymbol ? original : inChartStyle(op.newSymbol, unicode)));
    const option: ChartReharmonizationOption = Object.freeze({
      id: candidate.candidateId,
      lawId: candidate.lawId,
      family: candidate.family,
      kind,
      title: candidate.title.replace(/\s*\(.*\)$/, ""),
      explanation: candidate.explanation,
      before: Object.freeze([original]),
      after: Object.freeze(shown),
    });
    return [Object.freeze({ option, candidate })];
  });
  return { ok: true, at: located, unicode, options };
}

export function listChartReharmonizations(
  document: ProgressionDocumentV2,
  eventId: string,
): ChartReharmonizationList {
  const evaluated = evaluate(document, eventId);
  if (!evaluated.ok) return evaluated;
  return Object.freeze({
    ok: true,
    targetSymbol: evaluated.at.event.chord.sourceText,
    options: Object.freeze(evaluated.options.map((row) => row.option)),
  });
}

/**
 * The candidate document for one listed option. `newEventId` names the
 * inserted chord of a split; the caller allocates it and it must not already
 * exist. A replacement keeps every ID and duration, so A0 can prove exact
 * timing; a split keeps the original event (now the second half) and adds one.
 */
export function buildChartReharmonization(
  document: ProgressionDocumentV2,
  eventId: string,
  optionId: string,
  newEventId: ChordEventId | null,
): ChartReharmonizationCandidate {
  const evaluated = evaluate(document, eventId);
  if (!evaluated.ok) return evaluated;
  const row = evaluated.options.find((entry) => entry.option.id === optionId);
  if (row === undefined) return { ok: false, reason: "option-missing" };
  const { at } = evaluated;
  const target = at.event;
  if (target.chord.kind !== "parsed" || target.voicing.mode !== "auto") return { ok: false, reason: "stored-voicing" };
  const voicing = target.voicing;
  const eventWith = (
    id: ChordEventId,
    symbol: string,
    duration: ChordEvent["duration"],
    annotation: string,
  ): ParsedChordEvent | null => {
    const parsed = parseChordSymbol(symbol, evaluated.unicode ? "unicode" : "ascii");
    if (!parsed.ok || parsed.chord.bass !== null) return null;
    return { id, duration, annotation, chord: { ...parsed.chord, bass: null }, voicing };
  };
  const ops = row.candidate.editPlan.operations;
  let events: readonly ChordEvent[];
  let changedIds: string[];
  if (row.option.kind === "replace") {
    const replaced = eventWith(target.id, row.option.after[0] ?? "", target.duration, target.annotation);
    if (replaced === null) return { ok: false, reason: "unbuildable" };
    events = [replaced];
    changedIds = [target.id];
  } else {
    if (newEventId === null || locate(document, newEventId).at !== null) return { ok: false, reason: "unbuildable" };
    const built: ChordEvent[] = [];
    for (const [index, op] of ops.entries()) {
      const duration = makeBeatDuration(op.duration);
      if (!duration.ok) return { ok: false, reason: "unbuildable" };
      // The original keeps its identity, symbol and annotation; only its length halves.
      const event = op.newSymbol === op.originalSymbol
        ? { ...target, duration: duration.value }
        : eventWith(newEventId, row.option.after[index] ?? "", duration.value, "");
      if (event === null) return { ok: false, reason: "unbuildable" };
      built.push(event);
    }
    events = built;
    // The inserted event is new, the target's length and place changed, and
    // every later event in the measure moved one position.
    const measure = document.sections[at.sectionIndex]?.measures[at.measureIndex];
    const later = measure?.events.slice(at.eventIndex + 1).map((event) => event.id) ?? [];
    changedIds = [newEventId, target.id, ...later];
  }
  const candidate: ProgressionDocumentV2 = {
    ...document,
    sections: document.sections.map((section, sectionIndex) =>
      sectionIndex !== at.sectionIndex
        ? section
        : {
            ...section,
            measures: section.measures.map((measure, measureIndex) => {
              if (measureIndex !== at.measureIndex || measure.completion.kind === "empty") return measure;
              const before = measure.events.slice(0, at.eventIndex);
              const after = measure.events.slice(at.eventIndex + 1);
              const [head, ...tail] = [...before, ...events, ...after];
              return head === undefined ? measure : { ...measure, completion: measure.completion, events: [head, ...tail] };
            }),
          },
    ),
  };
  return Object.freeze({
    ok: true,
    option: row.option,
    candidate,
    changedIds: Object.freeze(changedIds),
    sourceEventIds: Object.freeze([target.id]),
    exactTimingPreserved: row.option.kind === "replace",
    focusEventIds: Object.freeze(newEventId === null || row.option.kind === "replace" ? [target.id] : [newEventId, target.id]),
  });
}
