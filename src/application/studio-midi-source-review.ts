import type { MidiImportPreview } from "./studio-midi-import";

export type MidiImportSpanKey = Readonly<{ measureIndex: number; startTick: number }>;
export type MidiSourceNote = Readonly<{
  trackIndex: number; trackName: string; channel: number; midiPitch: number;
  label: string; velocity: number; onTick: number; offTick: number; contributes: boolean;
}>;
export type MidiSourceReview = Readonly<{
  span: MidiImportSpanKey; endTick: number; ppq: number; repaired: boolean;
  occurrenceCount: number; trackCount: number; notesVisited: number; truncatedCount: number;
  notes: readonly MidiSourceNote[];
  pitches: readonly Readonly<{ midiPitch: number; label: string }>[];
}>;
export type MidiSourceReviewResult =
  | Readonly<{ ok: true; review: MidiSourceReview }>
  | Readonly<{ ok: false; message: string }>;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
function pitchLabel(key: number): string {
  return `${NOTE_NAMES[key % 12] ?? "?"}${String(Math.floor(key / 12) - 1)} (MIDI ${String(key)})`;
}

/** One requested span, one scan, at most 64 detail rows and 128 distinct keys.
 * The caller binds this result to the immutable pending preview identity. No
 * musical inference is added; these are the retained decoder occurrences.
 */
export function reviewMidiImportSource(preview: MidiImportPreview, key: MidiImportSpanKey): MidiSourceReviewResult {
  const plan = preview.automation;
  const decoded = preview.decoded;
  const span = plan?.readings.find(r => r.span.measureIndex === key.measureIndex && r.span.startTick === key.startTick)?.span;
  if (plan === null || decoded === null || span === undefined)
    return Object.freeze({ ok: false, message: "That passage is no longer in the pending import. Choose a current passage." });
  const excluded = new Set(plan.excludedTrackIndices);
  const notes: MidiSourceNote[] = [];
  const keys = new Set<number>();
  let occurrenceCount = 0;
  let trackCount = 0;
  let notesVisited = 0;
  for (const [trackIndex, track] of decoded.model.tracks.entries()) {
    const role = plan.classifications[trackIndex]?.role;
    if (excluded.has(trackIndex) || (role !== "bass" && role !== "harmony" && role !== "melody")) continue;
    let overlaps = false;
    for (const note of track.notes) {
      notesVisited += 1;
      if (note.channel === 9 || note.onTick >= span.endTick || note.offTick <= span.startTick) continue;
      occurrenceCount += 1;
      overlaps = true;
      keys.add(note.key);
      if (notes.length < 64) notes.push(Object.freeze({
        trackIndex, trackName: track.name ?? `Track ${String(trackIndex + 1)}`,
        channel: note.channel, midiPitch: note.key, label: pitchLabel(note.key), velocity: note.onVelocity,
        onTick: note.onTick, offTick: note.offTick,
        contributes: Math.min(note.offTick, span.endTick) - Math.max(note.onTick, span.startTick) >= Math.floor(decoded.model.header.division / 8) || note.onTick === span.startTick,
      }));
    }
    if (overlaps) trackCount += 1;
  }
  return Object.freeze({ ok: true, review: Object.freeze({
    span: Object.freeze({ measureIndex: span.measureIndex, startTick: span.startTick }), endTick: span.endTick,
    ppq: decoded.model.header.division, repaired: preview.salvage !== null,
    occurrenceCount, trackCount, notesVisited, truncatedCount: occurrenceCount - notes.length,
    notes: Object.freeze(notes),
    pitches: Object.freeze([...keys].sort((a, b) => a - b).map(midiPitch => Object.freeze({ midiPitch, label: pitchLabel(midiPitch) }))),
  }) });
}

/** Whole-set previews never silently truncate or use a key absent from source. */
export function sourceReviewPitches(review: MidiSourceReview, choice: number | "all"): readonly number[] | null {
  if (choice === "all") return review.pitches.length > 0 && review.pitches.length <= 16
    ? Object.freeze(review.pitches.map(p => p.midiPitch)) : null;
  return review.pitches.some(p => p.midiPitch === choice) ? Object.freeze([choice]) : null;
}
