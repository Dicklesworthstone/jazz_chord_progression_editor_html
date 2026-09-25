import {
  makeSpelledPitch,
  pitchClassOf,
  type ChordDegree,
  type ChordEventId,
  type ProgressionDocumentV2,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../domain";
import { parseChordSymbol, resolveChord } from "../theory";

/**
 * "Keep the bass and top, change the harmony" (September idea 13) for one
 * chord. Given the notes the chord actually sounds, every candidate is a real
 * chord - parsed and resolved by the T1 formula table - whose sounding bass is
 * the same pitch and which contains the same top pitch. Each candidate is
 * voiced as stored (Manual) notes: the exact bass and top pitches, respelled
 * in the candidate's own spelling, with inner voices stacked directly below
 * the top in priority order (guide tones, then colours, then fifth, root).
 *
 * The bass and top keep their exact written spelling (a C-flat is not the B
 * you had), and a candidate whose voiced notes sound the same as now is
 * dropped. Ranking uses two measured facts only - pitch classes shared with
 * the chord as it sounds now, then total inner-voice movement in semitones -
 * then root position before slash chords, then the symbol. No quality score
 * is claimed.
 */

export type BassTopAlternative = Readonly<{
  id: string;
  symbol: string;
  /** Pitch classes shared with the chord as it sounds now. */
  sharedTones: number;
  /** Total semitones the inner voices move from the chord as it sounds now. */
  innerMovement: number;
  /** Stored notes, low to high: exact bass, inner voices, exact top. */
  pitches: readonly SpelledPitch[];
  /** Names of those notes, low to high, e.g. "C3 E4 G4 B4". */
  voicingText: string;
}>;

const ROOTS: readonly SpelledPitchClass[] = Object.freeze(
  ([["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]] as const)
    .map(([step, alter]) => Object.freeze({ step, alter })),
);
const SUFFIXES = Object.freeze([
  "", "m", "6", "m6", "maj7", "7", "m7", "m7b5", "dim7", "m(maj7)", "7sus4",
  "maj9", "9", "m9", "13", "7b9", "7#9", "7#11", "7b13", "maj7#11", "m11",
]);
export const MAX_BASS_TOP_ALTERNATIVES = 8;

const NATURAL: Readonly<Record<string, number>> = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
const accidental = (alter: number): string => (alter < 0 ? "b".repeat(-alter) : "#".repeat(alter));
const nameOf = (pitch: SpelledPitchClass): string => `${pitch.step}${accidental(pitch.alter)}`;
const glyphName = (pitch: SpelledPitch): string =>
  `${pitch.step}${pitch.alter < 0 ? "♭".repeat(-pitch.alter) : "♯".repeat(pitch.alter)}${String(pitch.octave)}`;

/** The spelled pitch for an exact MIDI note in a given spelling, or null. */
function atMidi(spelling: SpelledPitchClass, midi: number): SpelledPitch | null {
  const base = (NATURAL[spelling.step] ?? 0) + spelling.alter;
  const octave = (midi - base) / 12 - 1;
  if (!Number.isInteger(octave)) return null;
  const made = makeSpelledPitch({ step: spelling.step, alter: spelling.alter, octave });
  return made.ok ? made.value : null;
}

/** Inner-voice priority: guide tones, colours, fifth, root. */
function priority(degree: ChordDegree): number {
  if (degree.number === 3 || degree.number === 7 || (degree.number === 4 && degree.alter === 0) || degree.number === 6) return 0;
  if (degree.number === 9 || degree.number === 11 || degree.number === 13 || degree.number === 2 || degree.alter !== 0) return 1;
  if (degree.number === 5) return 2;
  return 3;
}

/** One sounding note of the current chord: its exact pitch and spelling. */
export type SoundingNote = Readonly<{ midi: number; pitch: SpelledPitchClass }>;

export function bassTopAlternatives(
  sounding: readonly SoundingNote[],
  currentSymbol: string,
): readonly BassTopAlternative[] {
  if (sounding.length < 2) return [];
  const ordered = [...sounding].sort((left, right) => left.midi - right.midi);
  const soundingMidi = ordered.map((note) => note.midi);
  const bassNote = ordered[0];
  const topNote = ordered[ordered.length - 1];
  if (bassNote === undefined || topNote === undefined) return [];
  const currentInner = soundingMidi.slice(1, -1);
  const bassMidi = bassNote.midi;
  const topMidi = topNote.midi;
  const bassPc = ((bassMidi % 12) + 12) % 12;
  const topPc = ((topMidi % 12) + 12) % 12;
  const current = new Set(soundingMidi.map((midi) => ((midi % 12) + 12) % 12));
  const innerCount = Math.max(1, soundingMidi.length - 2);
  const bassSpellings = ROOTS.filter((root) => pitchClassOf(root) === bassPc);
  const found: (BassTopAlternative & { rootPosition: boolean })[] = [];
  const seen = new Set<string>();
  for (const root of ROOTS) {
    for (const suffix of SUFFIXES) {
      const rootPosition = pitchClassOf(root) === bassPc;
      const symbols = rootPosition
        ? [`${nameOf(root)}${suffix}`]
        : bassSpellings.map((bass) => `${nameOf(root)}${suffix}/${nameOf(bass)}`);
      for (const symbol of symbols) {
        if (symbol === currentSymbol) continue;
        const parsed = parseChordSymbol(symbol, "ascii");
        if (!parsed.ok) continue;
        const resolved = resolveChord(parsed.chord);
        if (!resolved.ok || resolved.value.realizations.length !== 1) continue;
        const realization = resolved.value.realizations[0];
        const degrees = realization.degrees;
        const tones = realization.spelledPitchNames.flatMap((spelled, index) => {
          const degree = degrees[index];
          return degree === undefined ? [] : [{ spelled, pc: pitchClassOf(spelled), degree }];
        });
        if (!tones.some((tone) => tone.pc === topPc)) continue;
        const bassSpelled = rootPosition ? parsed.chord.root : parsed.chord.bass;
        const topTone = tones.find((tone) => tone.pc === topPc);
        if (bassSpelled === null || topTone === undefined) continue;
        // Inner voices: highest priority first, stacked under the top.
        const inner = tones
          .filter((tone) => tone.pc !== bassPc && tone.pc !== topPc)
          .sort((left, right) => priority(left.degree) - priority(right.degree))
          .slice(0, innerCount);
        const guide = tones.filter((tone) => priority(tone.degree) === 0 && tone.pc !== bassPc && tone.pc !== topPc);
        if (guide.some((tone) => !inner.includes(tone))) continue; // cannot carry its identity
        const placed: SpelledPitch[] = [];
        // "Keep" means the same written notes: C♭5 is not the B4 you had.
        if (bassSpelled.step !== bassNote.pitch.step || bassSpelled.alter !== bassNote.pitch.alter ||
          topTone.spelled.step !== topNote.pitch.step || topTone.spelled.alter !== topNote.pitch.alter) continue;
        const bassPitch = atMidi(bassSpelled, bassMidi);
        const topPitch = atMidi(topTone.spelled, topMidi);
        if (bassPitch === null || topPitch === null) continue;
        let ok = true;
        for (const tone of inner) {
          const below = ((topPc - tone.pc) % 12 + 12) % 12 || 12;
          const midi = topMidi - below;
          const pitch = midi > bassMidi ? atMidi(tone.spelled, midi) : null;
          if (pitch === null) { ok = false; break; }
          placed.push(pitch);
        }
        if (!ok) continue;
        const midiOf = (pitch: SpelledPitch): number => (pitch.octave + 1) * 12 + (NATURAL[pitch.step] ?? 0) + pitch.alter;
        const pitches = [bassPitch, ...placed.sort((a, b) => midiOf(a) - midiOf(b)), topPitch];
        /* Judge by what SOUNDS: a colour tone that finds no inner voice is not
           heard, so a candidate whose voiced notes equal today's (G13 voiced
           as G7) is no change of harmony, and neither is a second symbol for
           notes already offered. */
        const sounded = new Set<number>(pitches.map((pitch) => ((midiOf(pitch) % 12) + 12) % 12));
        const soundKey = [...sounded].sort((a, b) => a - b).join(",");
        if (soundKey === [...current].sort((a, b) => a - b).join(",") || seen.has(soundKey)) continue;
        seen.add(soundKey);
        /* Inner-voice movement: each new inner note travels to the nearest
           current inner note (or the top/bass when there were none). */
        const targets = currentInner.length > 0 ? currentInner : [bassMidi, topMidi];
        const innerMovement = placed.reduce((sum, pitch) =>
          sum + Math.min(...targets.map((midi) => Math.abs(midiOf(pitch) - midi))), 0);
        found.push({
          id: symbol,
          symbol,
          sharedTones: [...sounded].filter((pc) => current.has(pc)).length,
          innerMovement,
          pitches: Object.freeze(pitches),
          voicingText: pitches.map(glyphName).join(" "),
          rootPosition,
        });
      }
    }
  }
  found.sort((left, right) =>
    right.sharedTones - left.sharedTones ||
    left.innerMovement - right.innerMovement ||
    Number(right.rootPosition) - Number(left.rootPosition) ||
    (left.symbol < right.symbol ? -1 : left.symbol > right.symbol ? 1 : 0));
  return Object.freeze(found.slice(0, MAX_BASS_TOP_ALTERNATIVES).map((row) => Object.freeze({
    id: row.id, symbol: row.symbol, sharedTones: row.sharedTones, innerMovement: row.innerMovement,
    pitches: row.pitches, voicingText: row.voicingText,
  })));
}

/** The candidate document with one chord replaced by an alternative, voiced as stored notes. */
export function buildBassTopAlternative(
  document: ProgressionDocumentV2,
  eventId: ChordEventId,
  alternative: BassTopAlternative,
): unknown {
  const parsed = parseChordSymbol(alternative.symbol, "ascii");
  if (!parsed.ok) return null;
  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      measures: section.measures.map((measure) => ({
        ...measure,
        events: measure.events.map((event) => event.id !== eventId ? event : {
          ...event,
          chord: parsed.chord,
          voicing: { mode: "manual", pitches: alternative.pitches, bassPolicy: "included" },
        }),
      })),
    })),
  };
}
