import {
  makeSpelledPitch,
  pitchClassOf,
  type ChordEvent,
  type ChordEventId,
  type KeyContext,
  type ProgressionDocumentV2,
  type SpelledPitch,
  type ValidatedDocument,
} from "../domain";
import {
  transposeChordSpecByInterval,
  transposeSpelledPitchClassExact,
  type SpelledInterval,
} from "../theory";

/**
 * Pure chart transposition for the A0 `transpose` command.
 *
 * Every parsed chord moves by one spelled interval through the parser-verified
 * H1-T core. Manual and Frozen voicings move EXACTLY: every stored pitch, in
 * order, duplicates included, keeps its relationship to the chord. Keys and
 * section key overrides move with a whole-chart transposition. Durations,
 * stable IDs, measures and annotations are untouched, so A0's derived-patch
 * validator can prove exact timing and identity.
 *
 * Nothing is silently repaired. A Custom chord (free-text label), a spelling
 * that needs more than a double accidental, or a pitch pushed outside MIDI
 * 0–127 refuses the whole transposition with the exact events named; the
 * musician can adjust those and try again.
 */

export type ChartTranspositionRefusalReason =
  | "custom-chord"
  | "spelling-overflow"
  | "symbol-unverified"
  | "pitch-out-of-range";

export type ChartTranspositionRefusal = Readonly<{
  eventId: ChordEventId | null;
  sourceText: string;
  reason: ChartTranspositionRefusalReason;
}>;

export type ChartTranspositionResult =
  | Readonly<{
      ok: true;
      /** Unvalidated: A0 validates it when the `transpose` patch publishes. */
      candidate: ProgressionDocumentV2;
      changedIds: readonly string[];
      changedEventIds: readonly ChordEventId[];
    }>
  | Readonly<{ ok: false; refusals: readonly ChartTranspositionRefusal[] }>;

const NATURAL_PC: Readonly<Record<string, number>> = Object.freeze({
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
});

function absoluteSemitone(pitch: SpelledPitch): number {
  return (pitch.octave + 1) * 12 + (NATURAL_PC[pitch.step] ?? 0) + pitch.alter;
}

/** Exact transposition of one registered pitch; null when it cannot be spelled or leaves MIDI. */
export function transposeSpelledPitchExact(
  pitch: SpelledPitch,
  interval: SpelledInterval,
): SpelledPitch | null {
  const pitchClass = transposeSpelledPitchClassExact(pitch, interval);
  if (pitchClass === null) return null;
  const target = absoluteSemitone(pitch) + interval.semitones;
  if (target < 0 || target > 127) return null;
  const octave =
    (target - (NATURAL_PC[pitchClass.step] ?? 0) - pitchClass.alter) / 12 - 1;
  const made = makeSpelledPitch({ ...pitchClass, octave });
  return made.ok && pitchClassOf(made.value) === ((target % 12) + 12) % 12
    ? made.value
    : null;
}

function transposeKey(key: KeyContext, interval: SpelledInterval): KeyContext | null {
  const tonic = transposeSpelledPitchClassExact(key.tonic, interval);
  return tonic === null ? null : Object.freeze({ tonic, mode: key.mode });
}

/**
 * Transpose the events in scope (all events when `scope` is null). Keys move
 * only for a whole-chart transposition, so a range keeps the analysis key the
 * rest of the chart uses.
 */
export function transposeChart(
  document: ValidatedDocument,
  interval: SpelledInterval,
  scope: ReadonlySet<ChordEventId> | null = null,
): ChartTranspositionResult {
  const refusals: ChartTranspositionRefusal[] = [];
  const changedIds = new Set<string>();
  const changedEventIds: ChordEventId[] = [];
  const wholeChart = scope === null;

  const moveEvent = (event: ChordEvent): ChordEvent => {
    if (scope !== null && !scope.has(event.id)) return event;
    if (event.chord.kind === "custom") {
      refusals.push({ eventId: event.id, sourceText: event.chord.sourceText, reason: "custom-chord" });
      return event;
    }
    const moved = transposeChordSpecByInterval(event.chord, interval);
    if (!moved.ok) {
      refusals.push({
        eventId: event.id,
        sourceText: event.chord.sourceText,
        reason: moved.code === "transpose.spelling-overflow" ? "spelling-overflow" : "symbol-unverified",
      });
      return event;
    }
    let voicing = event.voicing;
    if (voicing.mode !== "auto") {
      const pitches = voicing.pitches.map((pitch) => transposeSpelledPitchExact(pitch, interval));
      if (pitches.some((pitch) => pitch === null)) {
        refusals.push({ eventId: event.id, sourceText: event.chord.sourceText, reason: "pitch-out-of-range" });
        return event;
      }
      voicing = Object.freeze({
        ...voicing,
        pitches: Object.freeze(pitches as SpelledPitch[]) as typeof voicing.pitches,
      });
    }
    changedIds.add(String(event.id));
    changedEventIds.push(event.id);
    return Object.freeze({ ...event, chord: moved.chord, voicing }) as ChordEvent;
  };

  const sections = document.sections.map((section) => {
    let keyOverride = section.keyOverride;
    if (wholeChart && keyOverride !== null) {
      const moved = transposeKey(keyOverride, interval);
      if (moved === null) {
        refusals.push({ eventId: null, sourceText: section.name, reason: "spelling-overflow" });
      } else {
        keyOverride = moved;
        changedIds.add(String(section.id));
      }
    }
    return Object.freeze({
      ...section,
      keyOverride,
      measures: Object.freeze(
        section.measures.map(
          (measure) =>
            /* Mapping preserves length and completion, so an empty measure
               stays empty and a non-empty one stays non-empty. */
            Object.freeze({
              ...measure,
              events: Object.freeze(measure.events.map(moveEvent)),
            }) as typeof measure,
        ),
      ),
    });
  });

  let key = document.key;
  if (wholeChart && key !== null) {
    const moved = transposeKey(key, interval);
    if (moved === null) {
      refusals.push({ eventId: null, sourceText: "key", reason: "spelling-overflow" });
    } else {
      key = moved;
      changedIds.add(String(document.id));
    }
  }

  if (refusals.length > 0) return Object.freeze({ ok: false, refusals: Object.freeze(refusals) });
  return Object.freeze({
    ok: true,
    candidate: Object.freeze({ ...document, key, sections: Object.freeze(sections) }),
    changedIds: Object.freeze([...changedIds]),
    changedEventIds: Object.freeze(changedEventIds),
  });
}
