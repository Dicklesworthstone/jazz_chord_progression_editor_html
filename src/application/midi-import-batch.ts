import { MAX_MIDI_IMPORT_BYTES, type MidiImportValue } from "../export";
import type { MidiImportPreview } from "./studio-midi-import";

export const MAX_MIDI_IMPORT_CANDIDATES = 5;
export const MAX_MIDI_IMPORT_BATCH_BYTES = 8 * 1_024 * 1_024;

/** A local file capability supplied by the host; no network or DOM dependency. */
export type MidiImportLocalFile = Readonly<{
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;
export type MidiCandidateScore = Readonly<{
  score: number;
  reasons: readonly string[];
  notesVisited: number;
}>;
export type MidiImportCandidate = Readonly<{
  ordinal: number;
  fileName: string;
  preview: MidiImportPreview | null;
  ranking: MidiCandidateScore | null;
  problem: string | null;
}>;
export type MidiImportBatch = Readonly<{
  candidates: readonly MidiImportCandidate[];
  recommendedOrdinal: number | null;
  problem: string | null;
  bytesRead: number;
}>;

/** Ranking is an arrangement heuristic, never a verdict on musical quality.
 * One note scan, one tempo scan, one sonority scan. Exact integer comparisons
 * determine duration tiers; seconds are rounded only for the explanation.
 */
export function scoreMidiCandidate(value: MidiImportValue): MidiCandidateScore {
  let score = 30;
  const reasons: string[] = [];
  let first = Infinity;
  let last = 0;
  let notesVisited = 0;
  let activeTracks = 0;
  let lowNotes = 0;
  const channels = new Set<number>();
  for (const track of value.model.tracks) {
    if (track.notes.length > 0) activeTracks++;
    for (const note of track.notes) {
      notesVisited++;
      first = Math.min(first, note.onTick);
      last = Math.max(last, note.offTick);
      channels.add(note.channel);
      if (note.channel !== 9 && note.key <= 52) lowNotes++;
    }
  }
  let tempo = 500_000;
  let tick = 0;
  let duration = 0n;
  let unusualTempo = false;
  const segment = (end: number): void => {
    const start = Math.max(tick, first);
    if (end > start) {
      duration += BigInt(end - start) * BigInt(tempo);
      if (tempo < 187_500 || tempo > 1_500_000) unusualTempo = true;
    }
  };
  for (const entry of value.model.tempoMap) {
    if (entry.tick > last) break;
    segment(entry.tick);
    tick = entry.tick;
    tempo = entry.microsecondsPerQuarter;
  }
  segment(last);
  score += unusualTempo ? -25 : 15;
  reasons.push(unusualTempo ? "Tempo outside 40–320 BPM (−25)." : "Tempo within 40–320 BPM (+15).");
  const second = BigInt(value.model.header.division) * 1_000_000n;
  const durationPoints = duration >= 150n * second ? 15 : duration >= 60n * second ? 10 : -15;
  score += durationPoints;
  reasons.push(`${String(duration / second)} seconds from first note to last release (${durationPoints > 0 ? "+" : ""}${String(durationPoints)}). Short files may be intentional; completeness is unknown.`);
  if (activeTracks >= 5) score += 10;
  reasons.push(`${String(activeTracks)} sounding tracks (${activeTracks >= 5 ? "+10" : "+0"}).`);
  if (channels.size >= 3) score += 5;
  reasons.push(`${String(channels.size)} sounding channels (${channels.size >= 3 ? "+5" : "+0"}).`);
  if (channels.has(9)) score += 8;
  reasons.push(channels.has(9) ? "Percussion channel present (+8)." : "No percussion channel (+0).");
  if (lowNotes >= 20) score += 10;
  reasons.push(`${String(lowNotes)} low-register non-percussion notes (${lowNotes >= 20 ? "+10" : "+0"}).`);
  const dense = value.sonorities.filter((sonority) => sonority.pitchClasses.length >= 3).length;
  const harmonic = value.sonorities.length > 0 && dense * 2 >= value.sonorities.length;
  if (harmonic) score += 7;
  reasons.push(`${String(dense)} of ${String(value.sonorities.length)} attack groups contain at least three pitch classes (${harmonic ? "+7" : "+0"}).`);
  return Object.freeze({ score, reasons: Object.freeze(reasons), notesVisited });
}

/** At most five serial decodes / 8 MiB read / five M0-bounded previews retained.
 * Cancellation prevents further reads, decodes, progress and publication. It
 * cannot interrupt a currently executing synchronous bounded M0/M1 decode.
 * Ties preserve picker order, including duplicate filenames. No document edits.
 */
export async function compareMidiFiles(
  files: readonly MidiImportLocalFile[],
  readFile: (name: string, bytes: Uint8Array) => Promise<MidiImportPreview>,
  isCurrent: () => boolean,
  onProgress: (completed: number, total: number) => void,
): Promise<MidiImportBatch | null> {
  if (!isCurrent()) return null;
  const invalid = files.length === 0 || files.length > MAX_MIDI_IMPORT_CANDIDATES
    ? "Choose between one and five MIDI files."
    : files.some((file) => !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_MIDI_IMPORT_BYTES)
      ? "Each MIDI file must be at most 4 MiB."
      : files.reduce((sum, file) => sum + file.size, 0) > MAX_MIDI_IMPORT_BATCH_BYTES
        ? "Choose MIDI files totaling at most 8 MiB."
        : null;
  if (invalid !== null) return Object.freeze({ candidates: Object.freeze([]), recommendedOrdinal: null, problem: invalid, bytesRead: 0 });
  const candidates: MidiImportCandidate[] = [];
  let best: MidiImportCandidate | null = null;
  let bytesRead = 0;
  // Capture capabilities before awaiting: caller mutation cannot extend the batch.
  const selected = files.map((file) => ({ name: file.name, size: file.size, read: () => file.arrayBuffer() }));
  for (const [ordinal, file] of selected.entries()) {
    if (!isCurrent()) return null;
    onProgress(ordinal, selected.length);
    let preview: MidiImportPreview | null = null;
    let problem: string | null = null;
    try {
      const buffer = await file.read();
      if (!isCurrent()) return null;
      bytesRead += buffer.byteLength;
      if (buffer.byteLength !== file.size) {
        problem = "File size changed while reading; choose it again.";
      } else {
        preview = await readFile(file.name, new Uint8Array(buffer));
        if (!isCurrent()) return null;
        if (preview.decoded === null || (preview.automation === null && preview.blockedReason !== null)) {
          problem = preview.blockedReason ?? preview.refusal?.code ?? "No importable chords were found.";
        }
      }
    } catch {
      if (!isCurrent()) return null;
      problem = "Could not read or decode this file on this device.";
    }
    const ranking = preview?.decoded == null ? null : scoreMidiCandidate(preview.decoded);
    const candidate = Object.freeze({ ordinal, fileName: file.name, preview, ranking, problem });
    candidates.push(candidate);
    if (problem === null && ranking !== null && (best?.ranking == null || ranking.score > best.ranking.score)) best = candidate;
  }
  if (!isCurrent()) return null;
  onProgress(selected.length, selected.length);
  return Object.freeze({ candidates: Object.freeze(candidates), recommendedOrdinal: best?.ordinal ?? null, problem: null, bytesRead });
}
