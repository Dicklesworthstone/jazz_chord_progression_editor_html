import {
  MIDI_IMPORT_CANONICAL_SPELLINGS,
  type MidiImportResolutionOutcome,
  type SmfDecodedTrack,
  type SmfMeterEntry,
  type SmfPairedNote,
} from "./midi-import-contract";
import { resolveSonority } from "./midi-import";
import {
  countCodePoints,
  durationText,
  escapeSectionName,
  pitchClassText,
  symbolTextForAlternative,
} from "./midi-import-chart";
import {
  type M1GrooveChoice,
  type M1KeyInference,
  type M1Rational,
  type M1Span,
  type M1TrackClassification,
  type M1TrackRole,
  M1_BASS_MAX_KEY,
  M1_BASS_NAME_TOKENS,
  M1_CHUNK_CODE_POINT_LIMIT,
  M1_GROOVE_DECISION_TABLE,
  M1_MAJOR_KEY_PROFILE,
  M1_MAJOR_SCALE_OFFSETS,
  M1_MAJOR_TONIC_SPELLINGS,
  M1_MASS_WEIGHT_BASS,
  M1_MASS_WEIGHT_HARMONY,
  M1_MASS_WEIGHT_MELODY,
  M1_MAX_IMPORT_CHUNKS,
  M1_MAX_SEGMENT_DEPTH,
  M1_MELODY_MIN_MEAN_KEY,
  M1_MELODY_NAME_TOKENS,
  M1_MIN_SOUNDING_PPQ_DIVISOR,
  M1_MINOR_KEY_PROFILE,
  M1_MINOR_SCALE_OFFSETS,
  M1_MINOR_TONIC_SPELLINGS,
  M1_PERCUSSION_CHANNEL,
  M1_PERCUSSION_NAME_TOKENS,
  M1_SEGMENT_SPLIT_MIN_DIFFERENCE,
  M1_AUTOMATION_TRACE_SCHEMA,
  M1_TRACE_STAGES,
  type M1ImportTrace,
  type M1TraceDecision,
  type M1TraceRecord,
  type M1TraceStage,
} from "./midi-import-automation-contract";
import type { PitchClass, SpelledPitchClass } from "../domain";

/* Type-only re-exports so trace consumers stay on the public entry. */
export type {
  M1ImportTrace,
  M1TraceDecision,
  M1TraceRecord,
  M1TraceStage,
} from "./midi-import-automation-contract";

/**
 * M1 automated-import pipeline: the production implementation of the laws
 * frozen in docs/M1_MIDI_IMPORT_AUTOMATION_CONTRACT.md and
 * midi-import-automation-contract.ts (packet jcpe-ionn; build jcpe-upbz).
 *
 * Everything here is pure and exact: integer tick arithmetic and
 * cross-multiplied rational comparisons; no floating point participates in
 * any decision. The independent authority for these functions is the
 * fixture packet under tests/fixtures/midi-import-automation/, recomputed
 * by scripts/validate-m1-contract.ts with validator-resident reference
 * implementations — production and validator never share code.
 */

/* ------------------------------------------------------------------ *
 * M1-ROLE                                                             *
 * ------------------------------------------------------------------ */

type NamedNoteTrack = Readonly<{
  index: number;
  name: string | null;
  instrumentName: string | null;
  notes: readonly SmfPairedNote[];
}>;

function nameTokens(track: NamedNoteTrack): readonly string[] {
  return `${track.name ?? ""} ${track.instrumentName ?? ""}`
    .toLowerCase()
    .split(/[\s\-_0-9]+/)
    .filter((token) => token.length > 0);
}

function hasNameToken(
  track: NamedNoteTrack,
  list: readonly string[],
): boolean {
  return nameTokens(track).some((token) => list.includes(token));
}

/** Classifies one decoded track under the frozen M1-ROLE rule order. */
export function classifyTrack(track: NamedNoteTrack): M1TrackClassification {
  const attacks = track.notes.length;
  const base = { trackIndex: track.index, attacks };
  if (attacks === 0) {
    return Object.freeze({
      ...base,
      role: "silent",
      ruleFired: "silent-when-empty",
      chordAttacks: 0,
      sumKeys: 0,
      maxKey: 0,
    });
  }
  const onTickCounts = new Map<number, number>();
  for (const note of track.notes) {
    onTickCounts.set(note.onTick, (onTickCounts.get(note.onTick) ?? 0) + 1);
  }
  let chordAttacks = 0;
  let sumKeys = 0;
  let maxKey = 0;
  for (const note of track.notes) {
    if ((onTickCounts.get(note.onTick) ?? 0) > 1) chordAttacks += 1;
    sumKeys += note.key;
    if (note.key > maxKey) maxKey = note.key;
  }
  const stats = { chordAttacks, sumKeys, maxKey };
  const finish = (
    role: M1TrackRole,
    ruleFired: M1TrackClassification["ruleFired"],
  ): M1TrackClassification =>
    Object.freeze({ ...base, role, ruleFired, ...stats });
  const everyPercussionChannel = track.notes.every(
    (note) => note.channel === M1_PERCUSSION_CHANNEL,
  );
  if (everyPercussionChannel || hasNameToken(track, M1_PERCUSSION_NAME_TOKENS)) {
    return finish("percussion", "percussion-by-channel-or-token");
  }
  const monophonic = 4 * chordAttacks <= attacks;
  if (hasNameToken(track, M1_BASS_NAME_TOKENS)) {
    return finish("bass", "bass-by-token");
  }
  if (hasNameToken(track, M1_MELODY_NAME_TOKENS)) {
    return finish("melody", "melody-by-token");
  }
  if (maxKey <= M1_BASS_MAX_KEY && monophonic) {
    return finish("bass", "bass-by-register");
  }
  if (monophonic && 2 * sumKeys >= 2 * M1_MELODY_MIN_MEAN_KEY * attacks) {
    return finish("melody", "melody-by-line");
  }
  return finish("harmony", "harmony-otherwise");
}

/** Classifies every track of a decoded model in track order. */
export function classifyTracks(
  tracks: readonly SmfDecodedTrack[],
): readonly M1TrackClassification[] {
  return Object.freeze(tracks.map((track) => classifyTrack(track)));
}

/* ------------------------------------------------------------------ *
 * M1-SEG                                                              *
 * ------------------------------------------------------------------ */

export type M1RoleTrack = Readonly<{
  role: M1TrackRole;
  notes: readonly SmfPairedNote[];
}>;

function roleWeight(role: M1TrackRole): number {
  switch (role) {
    case "bass":
      return M1_MASS_WEIGHT_BASS;
    case "harmony":
      return M1_MASS_WEIGHT_HARMONY;
    case "melody":
      return M1_MASS_WEIGHT_MELODY;
    case "percussion":
    case "silent":
      return 0;
  }
}

function pitchClassOfKey(key: number): PitchClass {
  // Euclidean modulo lands exactly in the closed 0..11 union.
  return (((key % 12) + 12) % 12) as PitchClass;
}

export type M1MeasureBound = Readonly<{
  startTick: number;
  endTick: number;
  measureIndex: number;
  /** The governing meter, for duration emission and the pickup law. */
  numerator: number;
  beatUnit: number;
  /** The full bar length its meter names; endTick − startTick may be less. */
  fullBarTicks: number;
}>;
type MeasureBound = M1MeasureBound;

export type M1MeasureLawRefusal = Readonly<{
  code: "import.automation_meter_indivisible";
  tick: number;
}>;

/**
 * Measure boundaries from the file's own meter map (M0 prepended-default
 * law), extended one bar at a time until every note has ended.
 */
export function automationMeasureBounds(
  meterMap: readonly SmfMeterEntry[],
  ppq: number,
  horizonTick: number,
):
  | Readonly<{ ok: true; bounds: readonly MeasureBound[] }>
  | Readonly<{ ok: false; refusal: M1MeasureLawRefusal }> {
  const first = meterMap[0];
  const entries: readonly SmfMeterEntry[] =
    first !== undefined && first.tick === 0
      ? meterMap
      : [{ tick: 0, numerator: 4, denominatorPower: 2 }, ...meterMap];
  const bounds: MeasureBound[] = [];
  let measureIndex = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const beatUnit = 2 ** entry.denominatorPower;
    const lengthNumerator = entry.numerator * ppq * 4;
    if (lengthNumerator % beatUnit !== 0) {
      return {
        ok: false,
        refusal: {
          code: "import.automation_meter_indivisible",
          tick: entry.tick,
        },
      };
    }
    const barTicks = lengthNumerator / beatUnit;
    const next = entries[index + 1];
    const segmentEnd =
      next === undefined ? Number.POSITIVE_INFINITY : next.tick;
    let start = entry.tick;
    while (start < segmentEnd && start < horizonTick) {
      const end = Math.min(start + barTicks, segmentEnd);
      bounds.push(
        Object.freeze({
          startTick: start,
          endTick: end,
          measureIndex,
          numerator: entry.numerator,
          beatUnit,
          fullBarTicks: barTicks,
        }),
      );
      measureIndex += 1;
      start = end;
    }
    if (segmentEnd >= horizonTick) break;
  }
  return { ok: true, bounds: Object.freeze(bounds) };
}

type SpanMass = Readonly<{
  mass: readonly number[];
  contributing: readonly Readonly<{ key: number; role: M1TrackRole }>[];
}>;

function spanMass(
  tracks: readonly M1RoleTrack[],
  minSounding: number,
  startTick: number,
  endTick: number,
): SpanMass {
  const mass = new Array<number>(12).fill(0);
  const contributing: { key: number; role: M1TrackRole }[] = [];
  for (const track of tracks) {
    const weight = roleWeight(track.role);
    if (weight === 0) continue;
    for (const note of track.notes) {
      if (note.channel === M1_PERCUSSION_CHANNEL) continue;
      const overlap =
        Math.min(endTick, note.offTick) - Math.max(startTick, note.onTick);
      if (overlap <= 0) continue;
      if (overlap < minSounding && note.onTick !== startTick) continue;
      const pc = pitchClassOfKey(note.key);
      mass[pc] = (mass[pc] ?? 0) + weight * overlap;
      contributing.push({ key: note.key, role: track.role });
    }
  }
  return { mass, contributing };
}

function presentClasses(mass: readonly number[]): readonly PitchClass[] {
  const maxMass = Math.max(...mass);
  if (maxMass === 0) return [];
  const present: PitchClass[] = [];
  for (let pc = 0; pc < 12; pc += 1) {
    const value = mass[pc] ?? 0;
    if (value > 0 && 8 * value >= maxMass) present.push(pc as PitchClass);
  }
  return present;
}

/**
 * The harmonic-rhythm segmentation law: one span per bar by default,
 * splitting at exact midpoints (remainder left) down to quarter-bar depth
 * when the halves' present-class sets differ by at least the frozen bound.
 */
export function computeAutomationSpans(
  ppq: number,
  meterMap: readonly SmfMeterEntry[],
  tracks: readonly M1RoleTrack[],
):
  | Readonly<{ ok: true; spans: readonly M1Span[] }>
  | Readonly<{ ok: false; refusal: M1MeasureLawRefusal }> {
  const minSounding = Math.floor(ppq / M1_MIN_SOUNDING_PPQ_DIVISOR);
  let horizon = 0;
  for (const track of tracks) {
    for (const note of track.notes) {
      if (note.offTick > horizon) horizon = note.offTick;
    }
  }
  const boundsResult = automationMeasureBounds(meterMap, ppq, horizon);
  if (!boundsResult.ok) return boundsResult;
  const spans: M1Span[] = [];
  const emit = (
    measureIndex: number,
    depth: number,
    startTick: number,
    endTick: number,
  ): void => {
    const { mass, contributing } = spanMass(
      tracks,
      minSounding,
      startTick,
      endTick,
    );
    const present = presentClasses(mass);
    const silent = present.length === 0;
    if (!silent && depth < M1_MAX_SEGMENT_DEPTH) {
      const mid = startTick + Math.ceil((endTick - startTick) / 2);
      if (mid > startTick && mid < endTick) {
        const left = presentClasses(
          spanMass(tracks, minSounding, startTick, mid).mass,
        );
        const right = presentClasses(
          spanMass(tracks, minSounding, mid, endTick).mass,
        );
        /*
         * A silent half contributes the empty set: two chords in the first
         * half of a bar followed by silence must split rather than merge
         * into one unnameable cluster, while a chord sustained across the
         * whole bar never splits because both halves present the same set.
         */
        const union = new Set([...left, ...right]);
        let difference = 0;
        for (const pc of union) {
          if (left.includes(pc) !== right.includes(pc)) difference += 1;
        }
        if (difference >= M1_SEGMENT_SPLIT_MIN_DIFFERENCE) {
          emit(measureIndex, depth + 1, startTick, mid);
          emit(measureIndex, depth + 1, mid, endTick);
          return;
        }
      }
    }
    let bassKey: number | null = null;
    const bassContributors = contributing.filter(
      (note) => note.role === "bass",
    );
    const pool = bassContributors.length > 0 ? bassContributors : contributing;
    for (const note of pool) {
      if (bassKey === null || note.key < bassKey) bassKey = note.key;
    }
    spans.push(
      Object.freeze({
        measureIndex,
        depth,
        startTick,
        endTick,
        presentPitchClasses: Object.freeze(present),
        bassPitchClass: bassKey === null ? null : pitchClassOfKey(bassKey),
        silent,
      }),
    );
  };
  for (const bound of boundsResult.bounds) {
    emit(bound.measureIndex, 0, bound.startTick, bound.endTick);
  }
  return { ok: true, spans: Object.freeze(spans) };
}

/* ------------------------------------------------------------------ *
 * M1-KEY                                                              *
 * ------------------------------------------------------------------ */

/** Total eligible pitch-class mass over the whole stream, for key scoring. */
export function totalPitchClassMass(
  ppq: number,
  meterMap: readonly SmfMeterEntry[],
  tracks: readonly M1RoleTrack[],
): readonly number[] {
  const minSounding = Math.floor(ppq / M1_MIN_SOUNDING_PPQ_DIVISOR);
  let horizon = 0;
  for (const track of tracks) {
    for (const note of track.notes) {
      if (note.offTick > horizon) horizon = note.offTick;
    }
  }
  const { mass } = spanMass(tracks, minSounding, 0, horizon);
  return Object.freeze(mass);
}

export function inferAutomationKey(
  masses: readonly number[],
): M1KeyInference {
  if (masses.every((mass) => mass === 0)) return null;
  let best:
    | Readonly<{ tonic: number; mode: "major" | "minor"; score: number }>
    | null = null;
  let runnerUpScore = 0;
  for (const mode of ["major", "minor"] as const) {
    const profile =
      mode === "major" ? M1_MAJOR_KEY_PROFILE : M1_MINOR_KEY_PROFILE;
    for (let tonic = 0; tonic < 12; tonic += 1) {
      let score = 0;
      for (let pc = 0; pc < 12; pc += 1) {
        score += (masses[pc] ?? 0) * (profile[(pc - tonic + 12) % 12] ?? 0);
      }
      if (best === null) {
        best = { tonic, mode, score };
        continue;
      }
      const wins =
        score > best.score ||
        (score === best.score && best.mode === "minor" && mode === "major") ||
        (score === best.score && best.mode === mode && tonic < best.tonic);
      if (wins) {
        runnerUpScore = best.score;
        best = { tonic, mode, score };
      } else if (score > runnerUpScore) {
        runnerUpScore = score;
      }
    }
  }
  if (best === null) return null;
  return Object.freeze({
    tonicPitchClass: best.tonic as NonNullable<M1KeyInference>["tonicPitchClass"],
    mode: best.mode,
    score: best.score,
    runnerUpScore,
  });
}

/** Tonic spelling under the frozen mode tables. */
export function automationTonicSpelling(
  tonicPitchClass: number,
  mode: "major" | "minor",
): SpelledPitchClass {
  const table =
    mode === "major" ? M1_MAJOR_TONIC_SPELLINGS : M1_MINOR_TONIC_SPELLINGS;
  const spelling = table[tonicPitchClass];
  if (spelling === undefined) return { step: "C", alter: 0 };
  return spelling;
}

export type M1AbstractAlternative = Readonly<{
  rootPitchClass: number;
  inversion: "root" | "slash";
}>;

/**
 * The M1 §4.2 comparator over M0 alternatives: diatonic-root-first,
 * bass-is-root-first, then the original M0 order. Returns the reordered
 * indices; the sort is stable by construction.
 */
export function rerankAlternativeIndices(
  key: Readonly<{ tonicPitchClass: number; mode: "major" | "minor" }> | null,
  alternatives: readonly M1AbstractAlternative[],
): readonly number[] {
  const indices = alternatives.map((_, index) => index);
  if (key === null) return Object.freeze(indices);
  const offsets: readonly number[] =
    key.mode === "major" ? M1_MAJOR_SCALE_OFFSETS : M1_MINOR_SCALE_OFFSETS;
  const diatonic = (rootPc: number): boolean =>
    offsets.includes((rootPc - key.tonicPitchClass + 12) % 12);
  const sorted = [...indices].sort((a, b) => {
    const left = alternatives[a];
    const right = alternatives[b];
    if (left === undefined || right === undefined) return a - b;
    const diaA = diatonic(left.rootPitchClass) ? 0 : 1;
    const diaB = diatonic(right.rootPitchClass) ? 0 : 1;
    if (diaA !== diaB) return diaA - diaB;
    const posA = left.inversion === "root" ? 0 : 1;
    const posB = right.inversion === "root" ? 0 : 1;
    if (posA !== posB) return posA - posB;
    return a - b;
  });
  return Object.freeze(sorted);
}

/* ------------------------------------------------------------------ *
 * M1-GROOVE                                                           *
 * ------------------------------------------------------------------ */

export type M1FeelInput = Readonly<{
  ppq: number;
  microsecondsPerQuarter: number;
  barCount: number;
  tracks: readonly M1RoleTrack[];
}>;

export type M1FeelFeatures = Readonly<
  Record<
    | "tempoBpm"
    | "swungShare"
    | "sixteenthShare"
    | "attacksPerBar"
    | "melodyCoincidence"
    | "bassTwoFeel",
    M1Rational
  >
>;

const rational = (numerator: number, denominator: number): M1Rational =>
  Object.freeze({ numerator, denominator });

function rationalGte(a: M1Rational, b: M1Rational): boolean {
  return a.numerator * b.denominator >= b.numerator * a.denominator;
}
function rationalLte(a: M1Rational, b: M1Rational): boolean {
  return a.numerator * b.denominator <= b.numerator * a.denominator;
}
function rationalLt(a: M1Rational, b: M1Rational): boolean {
  return a.numerator * b.denominator < b.numerator * a.denominator;
}

/** Extracts the frozen feel features with exact-integer window arithmetic. */
export function extractFeelFeatures(input: M1FeelInput): M1FeelFeatures {
  const ppq = input.ppq;
  const half = Math.floor(ppq / 12);
  const straightCenter = Math.floor(ppq / 2);
  const swungCenter = Math.floor((2 * ppq) / 3);
  const barTicks = 4 * ppq;
  let swung = 0;
  let straight = 0;
  let sixteenth = 0;
  let eligibleAttacks = 0;
  const harmonyInstants = new Set<number>();
  let melodyAttacks = 0;
  let melodyCoincident = 0;
  const bassAttacksPerBar = new Map<number, number[]>();
  for (const track of input.tracks) {
    for (const note of track.notes) {
      const role = track.role;
      if (role === "percussion" || role === "silent") continue;
      if (role === "melody") {
        melodyAttacks += 1;
        continue;
      }
      eligibleAttacks += 1;
      const position = note.onTick % ppq;
      const inStraight =
        position >= straightCenter - half && position < straightCenter + half;
      const inSwung =
        position >= swungCenter - half && position <= swungCenter + half;
      if (inSwung) swung += 1;
      else if (inStraight || position === straightCenter + half) {
        // The shared boundary point belongs to the swung window.
        straight += 1;
      }
      if (!inSwung && !inStraight && position !== straightCenter + half) {
        const cell = Math.floor(ppq / 4);
        const cellIndex = Math.floor((2 * position + cell) / (2 * cell));
        if (cellIndex % 2 === 1) sixteenth += 1;
      }
      if (role === "harmony") harmonyInstants.add(note.onTick);
      if (role === "bass") {
        const bar = Math.floor(note.onTick / barTicks);
        const list = bassAttacksPerBar.get(bar) ?? [];
        list.push(note.onTick - bar * barTicks);
        bassAttacksPerBar.set(bar, list);
      }
    }
  }
  for (const track of input.tracks) {
    if (track.role !== "melody") continue;
    for (const note of track.notes) {
      if (harmonyInstants.has(note.onTick)) melodyCoincident += 1;
    }
  }
  let twoFeelBars = 0;
  for (let bar = 0; bar < input.barCount; bar += 1) {
    const attacks = bassAttacksPerBar.get(bar);
    if (attacks === undefined || attacks.length === 0) continue;
    const allOneAndThree = attacks.every((position) => {
      const beatIndex = Math.floor((2 * position + ppq) / (2 * ppq)) % 4;
      return beatIndex === 0 || beatIndex === 2;
    });
    if (allOneAndThree) twoFeelBars += 1;
  }
  const eighthTotal = swung + straight;
  return Object.freeze({
    tempoBpm: rational(
      Math.round(60_000_000 / input.microsecondsPerQuarter),
      1,
    ),
    swungShare:
      eighthTotal === 0 ? rational(0, 1) : rational(swung, eighthTotal),
    sixteenthShare:
      eligibleAttacks === 0
        ? rational(0, 1)
        : rational(sixteenth, eligibleAttacks),
    attacksPerBar: rational(harmonyInstants.size, Math.max(1, input.barCount)),
    melodyCoincidence:
      melodyAttacks === 0
        ? rational(0, 1)
        : rational(melodyCoincident, melodyAttacks),
    bassTwoFeel:
      input.barCount === 0
        ? rational(0, 1)
        : rational(twoFeelBars, input.barCount),
  });
}

function renderRational(value: M1Rational): string {
  if (value.denominator === 1) return String(value.numerator);
  if (value.numerator % value.denominator === 0) {
    return String(value.numerator / value.denominator);
  }
  return `${String(value.numerator)}/${String(value.denominator)}`;
}

/** Walks the frozen decision table; total by construction (row 8 default). */
export function selectGroove(features: M1FeelFeatures): M1GrooveChoice {
  for (const rule of M1_GROOVE_DECISION_TABLE) {
    let holds = true;
    for (const condition of rule.conditions) {
      const value = features[condition.feature];
      const bound = condition.value;
      if (condition.comparator === "gte" && !rationalGte(value, bound)) {
        holds = false;
      }
      if (condition.comparator === "lte" && !rationalLte(value, bound)) {
        holds = false;
      }
      if (condition.comparator === "lt" && !rationalLt(value, bound)) {
        holds = false;
      }
      if (condition.comparator === "between") {
        const upper = condition.upper;
        if (
          upper === null ||
          !rationalGte(value, bound) ||
          !rationalLte(value, upper)
        ) {
          holds = false;
        }
      }
      if (!holds) break;
    }
    if (holds) {
      let evidence: string = rule.evidenceTemplate;
      for (const [name, value] of Object.entries(features)) {
        evidence = evidence.replaceAll(`{${name}}`, renderRational(value));
      }
      return Object.freeze({
        grooveStyleId: rule.grooveStyleId,
        row: rule.row,
        features,
        evidence,
      });
    }
  }
  // Unreachable: row 8 has no conditions. Kept total for the type system.
  const fallback = M1_GROOVE_DECISION_TABLE[M1_GROOVE_DECISION_TABLE.length - 1];
  return Object.freeze({
    grooveStyleId: fallback?.grooveStyleId ?? "medium-swing@1",
    row: fallback?.row ?? 8,
    features,
    evidence: fallback?.evidenceTemplate ?? "",
  });
}

/* ------------------------------------------------------------------ *
 * M1-FORM                                                             *
 * ------------------------------------------------------------------ */

export type M1SectionPlan = Readonly<{
  name: string;
  startMeasureIndex: number;
}>;

function fileStemOf(fileName: string): string {
  const stem = fileName.replace(/\.(mid|midi)$/i, "").trim();
  return stem.length > 0 ? stem : "MIDI import";
}

/**
 * Marker-derived section plan (M1-FORM). Bar length here follows the same
 * measure math as segmentation; callers pass the bar tick length in effect
 * (single-meter v1 law: markers resolve against 4/4 bars of the given ppq
 * unless a caller-resolved measure index is supplied upstream).
 */
export function planImportSections(
  fileName: string,
  markers: readonly Readonly<{ tick: number; text: string }>[],
  ppq: number,
  tickToMeasure?: (tick: number) => number,
): readonly M1SectionPlan[] {
  if (markers.length === 0) {
    return Object.freeze([
      Object.freeze({ name: fileStemOf(fileName), startMeasureIndex: 0 }),
    ]);
  }
  const barTicks = 4 * ppq;
  const measureOf =
    tickToMeasure ?? ((tick: number) => Math.floor(tick / barTicks));
  const sections: M1SectionPlan[] = [];
  const sorted = [...markers].sort((a, b) => a.tick - b.tick);
  const firstMarker = sorted[0];
  if (firstMarker !== undefined && firstMarker.tick > 0) {
    sections.push(
      Object.freeze({ name: fileStemOf(fileName), startMeasureIndex: 0 }),
    );
  }
  const seen = new Map<string, number>();
  let emptyOrdinal = 0;
  for (const marker of sorted) {
    const trimmed = marker.text.trim();
    let name: string;
    if (trimmed.length === 0) {
      emptyOrdinal += 1;
      name = `Part ${String(emptyOrdinal)}`;
    } else {
      const count = (seen.get(trimmed) ?? 0) + 1;
      seen.set(trimmed, count);
      name = count === 1 ? trimmed : `${trimmed} (${String(count)})`;
    }
    sections.push(
      Object.freeze({ name, startMeasureIndex: measureOf(marker.tick) }),
    );
  }
  return Object.freeze(sections);
}

/* ------------------------------------------------------------------ *
 * M1-ENV: chunking                                                    *
 * ------------------------------------------------------------------ */

export type M1ChunkPlan =
  | Readonly<{
      ok: true;
      chunkCount: number;
      chunkMeasureCounts: readonly number[];
    }>
  | Readonly<{ ok: false; refusal: "import.automation_chart_too_large" }>;

/**
 * Greedy measure-boundary chunking under the 4096-code-point law. The
 * section header rides only the first chunk.
 */
export function chunkImportFragment(
  sectionHeaderCodePoints: number,
  measureTextCodePoints: readonly number[],
): M1ChunkPlan {
  const chunks: number[] = [];
  let current = 0;
  let running = sectionHeaderCodePoints;
  for (const piece of measureTextCodePoints) {
    if (current > 0 && running + piece > M1_CHUNK_CODE_POINT_LIMIT) {
      chunks.push(current);
      running = 0;
      current = 0;
    }
    running += piece;
    current += 1;
  }
  if (current > 0) chunks.push(current);
  if (chunks.length > M1_MAX_IMPORT_CHUNKS) {
    return Object.freeze({
      ok: false,
      refusal: "import.automation_chart_too_large",
    });
  }
  return Object.freeze({
    ok: true,
    chunkCount: chunks.length,
    chunkMeasureCounts: Object.freeze(chunks),
  });
}

/* ------------------------------------------------------------------ *
 * Key-aware spelling                                                  *
 * ------------------------------------------------------------------ */

const LETTER_SEQUENCE = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_NATURAL_PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
/** Spelling walks natural-mode degree sets; dorian tolerance is membership-only. */
const MAJOR_SPELLING_DEGREES = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_SPELLING_DEGREES = [0, 2, 3, 5, 7, 8, 10] as const;

/**
 * Spells a pitch class under an inferred key: diatonic degrees walk letters
 * from the tonic spelling (F sharp major spells pc 5 as E sharp, never F);
 * chromatic pitch classes fall back to the frozen M0 canonical flat table.
 */
export function spellPitchClassInKey(
  key: Readonly<{ tonicPitchClass: number; mode: "major" | "minor" }> | null,
  pitchClass: number,
): SpelledPitchClass {
  const canonical =
    MIDI_IMPORT_CANONICAL_SPELLINGS[((pitchClass % 12) + 12) % 12];
  const fallback: SpelledPitchClass = canonical ?? { step: "C", alter: 0 };
  if (key === null) return fallback;
  const degrees: readonly number[] =
    key.mode === "major" ? MAJOR_SPELLING_DEGREES : MINOR_SPELLING_DEGREES;
  const offset = (pitchClass - key.tonicPitchClass + 12) % 12;
  let degreeIndex = degrees.indexOf(offset);
  if (degreeIndex < 0 && key.mode === "minor") {
    // Raised sixth and seventh share their natural degree's letter: F sharp
    // and G sharp in A minor, never G flat or A flat.
    if (offset === 9) degreeIndex = 5;
    if (offset === 11) degreeIndex = 6;
  }
  if (degreeIndex < 0) return fallback;
  const tonicSpelled = automationTonicSpelling(
    ((key.tonicPitchClass % 12) + 12) % 12,
    key.mode,
  );
  const tonicLetterIndex = LETTER_SEQUENCE.indexOf(
    tonicSpelled.step,
  );
  if (tonicLetterIndex < 0) return fallback;
  const letter = LETTER_SEQUENCE[(tonicLetterIndex + degreeIndex) % 7];
  if (letter === undefined) return fallback;
  const naturalPc = LETTER_NATURAL_PITCH_CLASS[letter] ?? 0;
  const targetPc = (((key.tonicPitchClass + offset) % 12) + 12) % 12;
  const alter = ((targetPc - naturalPc + 18) % 12) - 6;
  if (alter < -2 || alter > 2) return fallback;
  // The guard above lands alter exactly in the closed Alteration range.
  return Object.freeze({
    step: letter,
    alter: alter as SpelledPitchClass["alter"],
  });
}

/* ------------------------------------------------------------------ *
 * The automatic import plan                                           *
 * ------------------------------------------------------------------ */

export type M1AutomationSpanReading = Readonly<{
  span: M1Span;
  outcome: MidiImportResolutionOutcome;
  /** Re-ranked winner rendered under the inferred key, or null (custom). */
  symbolText: string | null;
  /** Every renderable reading in M1 order, winner first. */
  alternativeTexts: readonly string[];
  customPitchNames: readonly string[];
  written: boolean;
}>;

export type M1AutomationSection = Readonly<{
  name: string;
  startMeasureIndex: number;
  measureCount: number;
}>;

export type M1AutomationPlan = Readonly<{
  classifications: readonly M1TrackClassification[];
  spans: readonly M1Span[];
  readings: readonly M1AutomationSpanReading[];
  key: M1KeyInference;
  keySpelled: SpelledPitchClass | null;
  groove: M1GrooveChoice;
  sections: readonly M1AutomationSection[];
  chartText: string;
  chunkTexts: readonly string[];
  measureCount: number;
  writtenChordCount: number;
  unwrittenSpanCount: number;
  emptyMeasureCount: number;
  usesExplicitDurations: boolean;
  codePointCount: number;
  /** Initial file tempo/meter, for the settings-transfer stage. */
  initialTempoMicroseconds: number;
  initialMeter: Readonly<{ numerator: number; beatUnit: number }>;
  tempoChangeCount: number;
  meterChangeCount: number;
  /** M1-TRACE records for the stages this pipeline owns (classify…envelope). */
  trace: readonly M1TraceRecord[];
}>;

export type M1AutomationPlanResult =
  | Readonly<{ ok: true; plan: M1AutomationPlan }>
  | Readonly<{
      ok: false;
      refusal:
        | M1MeasureLawRefusal
        | Readonly<{ code: "import.automation_nothing_to_write" }>
        | Readonly<{ code: "import.automation_chart_too_large" }>;
      /** The stages that DID run before the refusal (M1-TRACE). */
      trace?: readonly M1TraceRecord[];
    }>;

function boundContaining(
  bounds: readonly M1MeasureBound[],
  tick: number,
): M1MeasureBound | null {
  for (const bound of bounds) {
    if (bound.startTick <= tick && tick < bound.endTick) return bound;
  }
  const last = bounds[bounds.length - 1];
  return last ?? null;
}

/* ------------------------------------------------------------------ *
 * M1-TRACE: production trace emission                                  *
 * ------------------------------------------------------------------ */

/** Key-sorted JSON so a digest is a function of structure, not key order. */
function traceCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(traceCanonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${traceCanonicalJson(entry)}`,
      );
    return `{${entries.join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

/** FNV-1a 64 over UTF-16 code units, 16 hex digits (the frozen digest). */
function traceFnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function traceRecord(
  stage: M1TraceStage,
  input: unknown,
  workCounters: Readonly<Record<string, number>>,
  decisions: readonly M1TraceDecision[],
  refusalCode: string | null = null,
): M1TraceRecord {
  return Object.freeze({
    stage,
    inputDigest: traceFnv1a64(traceCanonicalJson(input)),
    workCounters: Object.freeze({ ...workCounters }),
    decisions: Object.freeze(decisions.map((entry) => Object.freeze(entry))),
    refusalCode,
  });
}

/**
 * Totalizes a partial trace: every stage in the frozen order gets exactly
 * one record, unreached stages carrying an explicit not-reached decision,
 * so a refused preview still states which stages never ran (M1-TRACE).
 */
export function completeImportTrace(
  records: readonly M1TraceRecord[],
): M1ImportTrace {
  const byStage = new Map(records.map((record) => [record.stage, record]));
  return Object.freeze({
    schema: M1_AUTOMATION_TRACE_SCHEMA,
    records: Object.freeze(
      M1_TRACE_STAGES.map(
        (stage) =>
          byStage.get(stage) ??
          traceRecord(stage, null, {}, [
            Object.freeze({
              subject: stage,
              outcome: "not-reached",
              reason: "an earlier stage refused before this one ran",
            }),
          ]),
      ),
    ),
  });
}

/**
 * Derives the complete automatic import from one decoded model: roles,
 * spans, key, per-span readings under the M1 comparator, groove choice,
 * marker-derived sections, chart text, and the chunk plan. Pure and total:
 * every failure is a coded refusal.
 */
export function planAutomationImport(
  value: Readonly<{
    model: Readonly<{
      header: Readonly<{ division: number }>;
      tempoMap: readonly Readonly<{
        tick: number;
        microsecondsPerQuarter: number;
      }>[];
      meterMap: readonly SmfMeterEntry[];
      tracks: readonly SmfDecodedTrack[];
    }>;
  }>,
  fileName: string,
): M1AutomationPlanResult {
  const ppq = value.model.header.division;
  const trace: M1TraceRecord[] = [];
  /* M1-DET: every per-item decision list is bounded, deterministically. */
  const DECISION_BOUND = 2_048;
  const bounded = (
    decisions: readonly M1TraceDecision[],
  ): readonly M1TraceDecision[] =>
    decisions.length <= DECISION_BOUND
      ? decisions
      : [
          ...decisions.slice(0, DECISION_BOUND),
          {
            subject: "decision-bound",
            outcome: "truncated",
            reason: `${String(decisions.length - DECISION_BOUND)} further decisions elided by the ${String(DECISION_BOUND)}-per-stage bound`,
          },
        ];
  const classifications = classifyTracks(value.model.tracks);
  trace.push(
    traceRecord(
      "classify",
      value.model.tracks.map((track) => ({
        name: track.name,
        instrumentName: track.instrumentName,
        notes: track.notes,
      })),
      { tracks: value.model.tracks.length },
      bounded(
        classifications.map((entry) => ({
          subject: `track-${String(entry.trackIndex)}`,
          outcome: entry.role,
          reason: entry.ruleFired,
        })),
      ),
    ),
  );
  const roleTracks: readonly M1RoleTrack[] = value.model.tracks.map(
    (track, index) => ({
      role: classifications[index]?.role ?? "harmony",
      notes: track.notes,
    }),
  );
  const spansResult = computeAutomationSpans(
    ppq,
    value.model.meterMap,
    roleTracks,
  );
  if (!spansResult.ok) {
    trace.push(
      traceRecord(
        "segment",
        { ppq, meterMap: value.model.meterMap },
        {},
        [
          {
            subject: "segment",
            outcome: "refused",
            reason: spansResult.refusal.code,
          },
        ],
        spansResult.refusal.code,
      ),
    );
    return { ok: false, refusal: spansResult.refusal, trace };
  }
  const spans = spansResult.spans;
  trace.push(
    traceRecord(
      "segment",
      spans,
      { spans: spans.length },
      bounded(
        spans.map((span) => ({
          subject: `measure-${String(span.measureIndex)}@${String(span.startTick)}`,
          outcome: span.silent
            ? "silent"
            : `present:${span.presentPitchClasses.map(String).join("+")}`,
          reason: `depth ${String(span.depth)}`,
        })),
      ),
    ),
  );

  const masses = totalPitchClassMass(ppq, value.model.meterMap, roleTracks);
  const key = inferAutomationKey(masses);
  trace.push(
    traceRecord("infer-key", masses, { candidates: 24 }, [
      {
        subject: "key",
        outcome:
          key === null ? "none" : `${String(key.tonicPitchClass)}/${key.mode}`,
        reason: "highest frozen-profile score",
      },
    ]),
  );
  const keyForSpelling =
    key === null
      ? null
      : { tonicPitchClass: key.tonicPitchClass, mode: key.mode };

  const readings: M1AutomationSpanReading[] = [];
  for (const span of spans) {
    if (span.silent || span.presentPitchClasses.length === 0) {
      readings.push(
        Object.freeze({
          span,
          outcome: Object.freeze({
            kind: "custom" as const,
            bassPitchClass: (span.bassPitchClass ?? 0),
            spelledPitchClasses: Object.freeze([]),
          }),
          symbolText: null,
          alternativeTexts: Object.freeze([]),
          customPitchNames: Object.freeze([]),
          written: false,
        }),
      );
      continue;
    }
    const bass = span.bassPitchClass ?? span.presentPitchClasses[0];
    const outcome = resolveSonority(
      span.presentPitchClasses,
      (bass ?? 0),
    );
    if (outcome.kind !== "alternatives") {
      readings.push(
        Object.freeze({
          span,
          outcome,
          symbolText: null,
          alternativeTexts: Object.freeze([]),
          customPitchNames: Object.freeze(
            outcome.spelledPitchClasses.map(pitchClassText),
          ),
          written: false,
        }),
      );
      continue;
    }
    const order = rerankAlternativeIndices(
      keyForSpelling,
      outcome.alternatives.map((alternative) => ({
        rootPitchClass: alternative.rootPitchClass,
        inversion: alternative.inversion,
      })),
    );
    const alternativeTexts: string[] = [];
    for (const index of order) {
      const alternative = outcome.alternatives[index];
      if (alternative === undefined) continue;
      const text = symbolTextForAlternative(alternative, {
        root: spellPitchClassInKey(
          keyForSpelling,
          alternative.rootPitchClass,
        ),
        bass: spellPitchClassInKey(keyForSpelling, alternative.bassPitchClass),
      });
      if (text !== null) alternativeTexts.push(text);
    }
    readings.push(
      Object.freeze({
        span,
        outcome,
        symbolText: alternativeTexts[0] ?? null,
        alternativeTexts: Object.freeze(alternativeTexts),
        customPitchNames: Object.freeze([]),
        written: false,
      }),
    );
  }

  trace.push(
    traceRecord(
      "resolve",
      spans.map((span) => span.presentPitchClasses),
      { spans: spans.length },
      [
        {
          subject: "resolution",
          outcome: "m0-resolveSonority-plus-m1-rerank",
          reason: "resolution law is M0's, re-ranked under the inferred key",
        },
      ],
    ),
  );

  let horizon = 0;
  for (const track of roleTracks) {
    for (const note of track.notes) {
      if (note.offTick > horizon) horizon = note.offTick;
    }
  }
  const boundsResult = automationMeasureBounds(
    value.model.meterMap,
    ppq,
    horizon,
  );
  if (!boundsResult.ok) {
    trace.push(
      traceRecord(
        "plan",
        { horizon },
        {},
        [
          {
            subject: "measure-bounds",
            outcome: "refused",
            reason: boundsResult.refusal.code,
          },
        ],
        boundsResult.refusal.code,
      ),
    );
    return { ok: false, refusal: boundsResult.refusal, trace };
  }
  const bounds = boundsResult.bounds;

  const markers: { tick: number; text: string }[] = [];
  for (const track of value.model.tracks) {
    for (const marker of track.markers) {
      markers.push({ tick: marker.tick, text: marker.text });
    }
  }
  const sectionsPlan = planImportSections(fileName, markers, ppq, (tick) => {
    const bound = boundContaining(bounds, tick);
    return bound === null ? 0 : bound.measureIndex;
  });

  const grooveInput: M1FeelInput = {
    ppq,
    microsecondsPerQuarter:
      value.model.tempoMap.find((entry) => entry.tick === 0)
        ?.microsecondsPerQuarter ??
      value.model.tempoMap[0]?.microsecondsPerQuarter ??
      500_000,
    barCount: Math.max(1, bounds.length),
    tracks: roleTracks,
  };
  const grooveFeatures = extractFeelFeatures(grooveInput);
  const groove = selectGroove(grooveFeatures);
  trace.push(
    traceRecord(
      "groove",
      grooveFeatures,
      { rows: M1_GROOVE_DECISION_TABLE.length },
      [
        {
          subject: "groove",
          outcome: groove.grooveStyleId,
          reason: `decision row ${String(groove.row)}`,
        },
      ],
    ),
  );

  /* Bar emission mirrors the M0 durationLaw over spans. */
  const writtenReadings = readings.filter(
    (reading) => reading.symbolText !== null,
  );
  if (writtenReadings.length === 0) {
    trace.push(
      traceRecord(
        "plan",
        { writtenReadings: 0 },
        { spans: readings.length },
        [
          {
            subject: "plan",
            outcome: "refused",
            reason: "no sonority produced a writable symbol",
          },
        ],
        "import.automation_nothing_to_write",
      ),
    );
    return {
      ok: false,
      refusal: { code: "import.automation_nothing_to_write" },
      trace,
    };
  }

  const sectionStarts = new Map<number, string>();
  for (const section of sectionsPlan) {
    if (!sectionStarts.has(section.startMeasureIndex)) {
      sectionStarts.set(section.startMeasureIndex, section.name);
    }
  }
  if (!sectionStarts.has(0)) {
    const firstName = sectionsPlan[0]?.name ?? "MIDI import";
    sectionStarts.set(0, firstName);
  }

  const byMeasure = new Map<number, M1AutomationSpanReading[]>();
  for (const reading of readings) {
    const list = byMeasure.get(reading.span.measureIndex) ?? [];
    list.push(reading);
    byMeasure.set(reading.span.measureIndex, list);
  }

  let usesExplicitDurations = false;
  let emptyMeasureCount = 0;
  let writtenChordCount = 0;
  const mutableWritten = new Set<M1AutomationSpanReading>();
  const measureTexts: string[] = [];
  for (const bound of bounds) {
    const list = (byMeasure.get(bound.measureIndex) ?? []).filter(
      (reading) => reading.symbolText !== null,
    );
    if (list.length === 0) {
      measureTexts.push("");
      emptyMeasureCount += 1;
      continue;
    }
    list.sort((a, b) => a.span.startTick - b.span.startTick);
    const barTicks = bound.endTick - bound.startTick;
    const beatScaled = ppq * 4;
    const barScaled = barTicks * bound.beatUnit;
    const isShortBar = barTicks !== bound.fullBarTicks;
    const offsets = list.map(
      (reading) => (reading.span.startTick - bound.startTick) * bound.beatUnit,
    );
    if (offsets.length > 0) offsets[0] = 0;
    const count = offsets.length;
    let dividesEvenly = !isShortBar;
    if (dividesEvenly) {
      for (let position = 0; position < count; position += 1) {
        if ((offsets[position] ?? 0) * count !== position * barScaled) {
          dividesEvenly = false;
          break;
        }
      }
    }
    const tokens: string[] = [];
    for (let position = 0; position < count; position += 1) {
      const reading = list[position];
      const symbolText = reading?.symbolText;
      if (reading === undefined || symbolText === null || symbolText === undefined) {
        continue;
      }
      writtenChordCount += 1;
      mutableWritten.add(reading);
      if (dividesEvenly) {
        tokens.push(symbolText);
        continue;
      }
      usesExplicitDurations = true;
      const start = offsets[position] ?? 0;
      const end =
        position + 1 < count ? (offsets[position + 1] ?? 0) : barScaled;
      tokens.push(`${symbolText}${durationText(end - start, beatScaled)}`);
    }
    measureTexts.push(tokens.join(" "));
  }

  /* Assemble sectioned chart text and section-aware chunks. */
  const sectionRanges: { name: string; start: number; end: number }[] = [];
  const startIndices = [...sectionStarts.keys()].sort(
    (left, right) => left - right,
  );
  for (let index = 0; index < startIndices.length; index += 1) {
    const start = startIndices[index] ?? 0;
    const end = startIndices[index + 1] ?? measureTexts.length;
    const name = sectionStarts.get(start) ?? "MIDI import";
    if (start >= measureTexts.length) continue;
    sectionRanges.push({ name, start, end: Math.min(end, measureTexts.length) });
  }

  const lineFor = (texts: readonly string[]): string =>
    `|${texts.map((text) => (text.length === 0 ? "" : ` ${text}`)).join(" |")} |`;

  const sectionTexts: string[] = [];
  const chunkTexts: string[] = [];
  let currentChunk = "";
  const flushChunk = (): void => {
    if (currentChunk.length > 0) {
      chunkTexts.push(currentChunk);
      currentChunk = "";
    }
  };
  for (const range of sectionRanges) {
    const header = `[${escapeSectionName(range.name)}]\n`;
    const body = `${lineFor(measureTexts.slice(range.start, range.end))}\n`;
    sectionTexts.push(`${header}${body}`);
    /* Chunking: try whole sections first; split at measures when needed. */
    const whole = `${header}${body}`;
    if (countCodePoints(currentChunk) + countCodePoints(whole) <= M1_CHUNK_CODE_POINT_LIMIT) {
      currentChunk += whole;
      continue;
    }
    flushChunk();
    if (countCodePoints(whole) <= M1_CHUNK_CODE_POINT_LIMIT) {
      currentChunk = whole;
      continue;
    }
    /*
     * Split one oversize section at measure boundaries. The section header
     * rides only the first piece; continuation pieces are bare bar lines
     * that append to the section the previous chunk created.
     */
    let piece = header;
    let pieceMeasures: string[] = [];
    for (const text of measureTexts.slice(range.start, range.end)) {
      const candidate = [...pieceMeasures, text];
      const candidateText = `${piece}${lineFor(candidate)}\n`;
      if (
        countCodePoints(candidateText) > M1_CHUNK_CODE_POINT_LIMIT &&
        pieceMeasures.length > 0
      ) {
        chunkTexts.push(`${piece}${lineFor(pieceMeasures)}\n`);
        piece = "";
        pieceMeasures = [text];
        continue;
      }
      pieceMeasures = candidate;
    }
    if (pieceMeasures.length > 0) {
      chunkTexts.push(`${piece}${lineFor(pieceMeasures)}\n`);
    }
  }
  flushChunk();

  if (chunkTexts.length > M1_MAX_IMPORT_CHUNKS) {
    trace.push(
      traceRecord(
        "plan",
        { chunkCount: chunkTexts.length },
        { chunks: chunkTexts.length },
        [
          {
            subject: "plan",
            outcome: "refused",
            reason: `${String(chunkTexts.length)} chunks exceed the ${String(M1_MAX_IMPORT_CHUNKS)}-chunk bound`,
          },
        ],
        "import.automation_chart_too_large",
      ),
    );
    return {
      ok: false,
      refusal: { code: "import.automation_chart_too_large" },
      trace,
    };
  }

  const chartText = sectionTexts.join("");
  trace.push(
    traceRecord(
      "plan",
      sectionRanges.map((range) => ({
        name: range.name,
        startMeasureIndex: range.start,
      })),
      {
        sections: sectionRanges.length,
        measures: bounds.length,
        chunks: chunkTexts.length,
        writtenChords: writtenChordCount,
      },
      bounded(
        sectionRanges.map((range) => ({
          subject: range.name,
          outcome: `starts-at-measure-${String(range.start)}`,
          reason: "M1-FORM",
        })),
      ),
    ),
  );
  trace.push(
    traceRecord(
      "envelope",
      { insertChunks: chunkTexts.length },
      { chunks: chunkTexts.length },
      [
        {
          subject: "envelope",
          outcome: `planned:${String(chunkTexts.length)}-chunk-insert`,
          reason:
            "destination-dependent order resolves at commit (amendment #1: a starter issues settings before the insert; groove last)",
        },
      ],
    ),
  );
  const frozenReadings = Object.freeze(
    readings.map((reading) =>
      Object.freeze({ ...reading, written: mutableWritten.has(reading) }),
    ),
  );
  const meterEntry = value.model.meterMap.find((entry) => entry.tick === 0) ??
    value.model.meterMap[0] ?? {
      tick: 0,
      numerator: 4,
      denominatorPower: 2,
    };
  return {
    ok: true,
    plan: Object.freeze({
      classifications,
      spans,
      readings: frozenReadings,
      key,
      keySpelled:
        key === null
          ? null
          : automationTonicSpelling(key.tonicPitchClass, key.mode),
      groove,
      sections: Object.freeze(
        sectionRanges.map((range) =>
          Object.freeze({
            name: range.name,
            startMeasureIndex: range.start,
            measureCount: range.end - range.start,
          }),
        ),
      ),
      chartText,
      chunkTexts: Object.freeze(chunkTexts),
      measureCount: measureTexts.length,
      writtenChordCount,
      unwrittenSpanCount: frozenReadings.filter(
        (reading) => !reading.written && !reading.span.silent,
      ).length,
      emptyMeasureCount,
      usesExplicitDurations,
      codePointCount: countCodePoints(chartText),
      initialTempoMicroseconds: grooveInput.microsecondsPerQuarter,
      initialMeter: Object.freeze({
        numerator: meterEntry.numerator,
        beatUnit: 2 ** meterEntry.denominatorPower,
      }),
      tempoChangeCount: Math.max(0, value.model.tempoMap.length - 1),
      meterChangeCount: Math.max(0, value.model.meterMap.length - 1),
      trace: Object.freeze([...trace]),
    }),
  };
}
