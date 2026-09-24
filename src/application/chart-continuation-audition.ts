import {
  addBeatValues,
  makeBeatDuration,
  normalizeBeatValue,
  type BeatValue,
  type ChordEvent,
  type ChordEventId,
  type MeasureId,
  type ProgressionDocumentV2,
} from "../domain";
import { parseChordSymbol } from "../theory";
import { A0_U1_NEW_EVENT_AUTO_VOICING } from "./application-edit-plan-contract";

/**
 * "Hear this next chord": a short audition document for one suggested
 * continuation. It plays the chord before the anchor (when there is one), the
 * anchor, then the candidate, each for one bar of the anchor's own measure
 * length, so the listener hears the motion rather than the chord alone.
 *
 * Nothing of the chart changes. Stored (Manual/Frozen) voicings of the
 * context chords are kept exactly; the candidate uses the anchor's Auto
 * voicing when it has one, else the same default a newly added chord gets.
 * The result is an unvalidated candidate; callers validate and compile it.
 */

export type ContinuationAuditionIds = Readonly<{
  /** One fresh measure ID per audition bar (at most three are used). */
  measureIds: readonly MeasureId[];
  eventId: ChordEventId;
}>;

export type ContinuationAuditionResult =
  /** An unvalidated document shape: callers decode and validate it before use. */
  | Readonly<{ ok: true; document: unknown }>
  | Readonly<{ ok: false; reason: "no-anchor" | "symbol-invalid" | "unbuildable" }>;

export function continuationAudition(
  document: ProgressionDocumentV2,
  anchorEventId: string | null,
  symbolText: string,
  ids: ContinuationAuditionIds,
): ContinuationAuditionResult {
  const timeline: { event: ChordEvent; measureEvents: readonly ChordEvent[]; sectionIndex: number }[] = [];
  document.sections.forEach((section, sectionIndex) => {
    for (const measure of section.measures) {
      for (const event of measure.events) timeline.push({ event, measureEvents: measure.events, sectionIndex });
    }
  });
  const anchorIndex = anchorEventId === null
    ? timeline.length - 1
    : timeline.findIndex((entry) => entry.event.id === anchorEventId);
  const anchor = timeline[anchorIndex];
  if (anchor === undefined) return { ok: false, reason: "no-anchor" };

  const unicode = /[♭♯]/.test(anchor.event.chord.sourceText);
  const parsed = parseChordSymbol(symbolText, unicode ? "unicode" : "ascii");
  if (!parsed.ok) return { ok: false, reason: "symbol-invalid" };

  // One bar is the anchor measure's own length, whatever the meter.
  const zero = normalizeBeatValue({ numerator: 0, denominator: 1 });
  if (!zero.ok) return { ok: false, reason: "unbuildable" };
  let barValue: BeatValue = zero.value;
  for (const event of anchor.measureEvents) {
    const sum = addBeatValues(barValue, event.duration);
    if (!sum.ok) return { ok: false, reason: "unbuildable" };
    barValue = sum.value;
  }
  const bar = makeBeatDuration(barValue);
  if (!bar.ok) return { ok: false, reason: "unbuildable" };

  const previous = anchorIndex > 0 ? timeline[anchorIndex - 1]?.event : undefined;
  const anchorVoicing = anchor.event.voicing.mode === "auto" ? anchor.event.voicing : null;
  // A slash chord needs a voicing that sounds its bass: rootless voicings
  // take an external bass, a no-bass voicing falls back to the new-chord
  // default (which generates one).
  const voicing = anchorVoicing === null
    ? A0_U1_NEW_EVENT_AUTO_VOICING
    : parsed.chord.bass === null
      ? anchorVoicing
      : anchorVoicing.family === "rootless-a" || anchorVoicing.family === "rootless-b"
        ? { ...anchorVoicing, bassPolicy: "external" }
        : anchorVoicing.bassPolicy === "none"
          ? A0_U1_NEW_EVENT_AUTO_VOICING
          : anchorVoicing;
  const candidate = { id: ids.eventId, duration: bar.value, annotation: "", chord: parsed.chord, voicing };
  const events: unknown[] = [
    ...(previous === undefined ? [] : [{ ...previous, duration: bar.value }]),
    { ...anchor.event, duration: bar.value },
    candidate,
  ];
  if (ids.measureIds.length < events.length) return { ok: false, reason: "unbuildable" };
  const section = document.sections[anchor.sectionIndex];
  if (section === undefined) return { ok: false, reason: "unbuildable" };
  const measures = [];
  for (const [index, event] of events.entries()) {
    const id = ids.measureIds[index];
    if (id === undefined) return { ok: false, reason: "unbuildable" };
    measures.push({ id, completion: { kind: "complete" }, events: [event] });
  }
  return {
    ok: true,
    document: { ...document, sections: [{ ...section, measures }] },
  };
}
