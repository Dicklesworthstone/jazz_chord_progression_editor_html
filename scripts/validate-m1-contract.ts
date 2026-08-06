/**
 * validate-m1-contract.ts — M1 automated-import packet validator (jcpe-ionn).
 *
 * Recomputes every fixture family under tests/fixtures/midi-import-automation/
 * with reference implementations written HERE from the laws in
 * docs/M1_MIDI_IMPORT_AUTOMATION_CONTRACT.md — never by importing production
 * pipeline code — then applies the named mutation controls (each must fail),
 * verifies the packet manifest digests, and compares the trace golden.
 *
 * Usage:
 *   bun scripts/validate-m1-contract.ts                 # frozen verification
 *   bun scripts/validate-m1-contract.ts --emit-pending  # author manifest+trace golden
 *
 * No third-party packages. Exit 0 with zero findings, exit 1 otherwise.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  M1_AUTOMATION_CONTRACT_SCHEMA,
  M1_AUTOMATION_TRACE_SCHEMA,
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
  M1_TRACE_STAGES,
} from "../src/export/midi-import-automation-contract";

type Finding = Readonly<{ check: string; subject: string; detail: string }>;
const findings: Finding[] = [];
const fail = (check: string, subject: string, detail: string): void => {
  findings.push(Object.freeze({ check, subject, detail }));
};

const FIXTURE_DIR = join(
  import.meta.dir,
  "..",
  "tests",
  "fixtures",
  "midi-import-automation",
);
const emitPending = process.argv.includes("--emit-pending");

/* ------------------------------------------------------------------ *
 * Fixture shapes                                                      *
 * ------------------------------------------------------------------ */

type Note = readonly [number, number, number, number];
type Rational = readonly [number, number];
type JsonObject = Record<string, unknown>;

type TrackInput = Readonly<{
  name: string | null;
  instrumentName: string | null;
  notes: readonly Note[];
}>;
type ClassificationCase = Readonly<{
  name: string;
  track: TrackInput;
  expected: Readonly<{ role: string; ruleFired: string }>;
}>;
type ClassificationFamily = Readonly<{ cases: readonly ClassificationCase[] }>;

type MeterEntry = Readonly<{
  tick: number;
  numerator: number;
  denominatorPower: number;
}>;
type RoleTrack = Readonly<{ role: string; notes: readonly Note[] }>;
type Span = Readonly<{
  measureIndex: number;
  depth: number;
  startTick: number;
  endTick: number;
  present: readonly number[];
  bass: number | null;
  silent: boolean;
}>;
type SegmentationCase = Readonly<{
  name: string;
  ppq: number;
  meterMap: readonly MeterEntry[];
  tracks: readonly RoleTrack[];
  expectedSpans: readonly Span[];
}>;
type SegmentationFamily = Readonly<{ cases: readonly SegmentationCase[] }>;

type KeyExpectation = Readonly<{
  tonicPitchClass: number;
  mode: "major" | "minor";
  spelling: Readonly<{ step: string; alter: number }>;
}> | null;
type KeyCase = Readonly<{
  name: string;
  masses: readonly number[];
  equivariance: boolean;
  expected: KeyExpectation;
}>;
type KeyFamily = Readonly<{ cases: readonly KeyCase[] }>;

type RerankKey = Readonly<{
  tonicPitchClass: number;
  mode: "major" | "minor";
}> | null;
type RerankCase = Readonly<{
  name: string;
  key: RerankKey;
  alternatives: readonly (readonly [number, string])[];
  expectedOrder: readonly number[];
}>;
type RerankFamily = Readonly<{ cases: readonly RerankCase[] }>;

type DecisionCase = Readonly<{
  name: string;
  features: Readonly<Record<string, Rational>>;
  expected: Readonly<{ row: number; grooveStyleId: string }>;
}>;
type FeatureCase = Readonly<{
  name: string;
  ppq: number;
  microsecondsPerQuarter: number;
  barCount: number;
  tracks: readonly RoleTrack[];
  expectedFeatures: Readonly<Record<string, Rational>>;
}>;
type GrooveFamily = Readonly<{
  decisionCases: readonly DecisionCase[];
  featureCases: readonly FeatureCase[];
}>;

type TruthTableCase = Readonly<{
  name: string;
  destination: string;
  documentGroove: string;
  fragmentUsesExplicitDurations: boolean;
  fileMeterDiffersFromDocument?: boolean;
  expected: JsonObject;
}>;
type MarkerCase = Readonly<{
  name: string;
  fileName: string;
  markers: readonly (readonly [number, string])[];
  ppq?: number;
  measures: number;
  expectedSections: readonly Readonly<{
    name: string;
    startMeasureIndex: number;
  }>[];
}>;
type TransferFamily = Readonly<{
  truthTableCases: readonly TruthTableCase[];
  markerCases: readonly MarkerCase[];
}>;

type ChunkingCase = Readonly<{
  name: string;
  sectionHeaderCodePoints: number;
  measureTextCodePoints: readonly number[];
  expected: JsonObject;
}>;
type EnvelopeRunCase = Readonly<{
  name: string;
  commandsApplicable: Readonly<{
    insertChunks: number;
    settings: boolean;
    groove: boolean;
  }>;
  refusalAtIndex: number | null;
  expected: JsonObject;
}>;
type EnvelopeFamily = Readonly<{
  chunkingCases: readonly ChunkingCase[];
  envelopeCases: readonly EnvelopeRunCase[];
}>;

type MutationControl = Readonly<{
  name: string;
  family: string;
  caseName: string;
  path: string;
  value: unknown;
  expectedCheck: string;
}>;
type MutationFamily = Readonly<{ mutations: readonly MutationControl[] }>;

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")) as unknown;

/* ------------------------------------------------------------------ *
 * Shared helpers                                                      *
 * ------------------------------------------------------------------ */

const pcOf = (key: number): number => ((key % 12) + 12) % 12;
const ratEq = (a: Rational, b: Rational): boolean =>
  a[0] * b[1] === b[0] * a[1];
const ratGte = (a: Rational, b: Rational): boolean =>
  a[0] * b[1] >= b[0] * a[1];
const ratLte = (a: Rational, b: Rational): boolean =>
  a[0] * b[1] <= b[0] * a[1];
const ratLt = (a: Rational, b: Rational): boolean => a[0] * b[1] < b[0] * a[1];

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as JsonObject)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  if (value === undefined) return "null";
  return JSON.stringify(value);
};

const fnv1a64 = (text: string): string => {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
};

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

/* ------------------------------------------------------------------ *
 * M1-ROLE reference                                                   *
 * ------------------------------------------------------------------ */

const tokensOf = (track: TrackInput): readonly string[] =>
  `${track.name ?? ""} ${track.instrumentName ?? ""}`
    .toLowerCase()
    .split(/[\s\-_0-9]+/)
    .filter((token) => token.length > 0);

const hasToken = (track: TrackInput, list: readonly string[]): boolean =>
  tokensOf(track).some((token) => list.includes(token));

const classifyTrack = (
  track: TrackInput,
): Readonly<{ role: string; ruleFired: string }> => {
  const attacks = track.notes.length;
  if (attacks === 0) return { role: "silent", ruleFired: "silent-when-empty" };
  const everyPercussionChannel = track.notes.every(
    (note) => note[0] === M1_PERCUSSION_CHANNEL,
  );
  if (everyPercussionChannel || hasToken(track, M1_PERCUSSION_NAME_TOKENS)) {
    return { role: "percussion", ruleFired: "percussion-by-channel-or-token" };
  }
  const onTickCounts = new Map<number, number>();
  for (const note of track.notes) {
    onTickCounts.set(note[2], (onTickCounts.get(note[2]) ?? 0) + 1);
  }
  let chordAttacks = 0;
  let sumKeys = 0;
  let maxKey = 0;
  for (const note of track.notes) {
    if ((onTickCounts.get(note[2]) ?? 0) > 1) chordAttacks += 1;
    sumKeys += note[1];
    if (note[1] > maxKey) maxKey = note[1];
  }
  const monophonic = 4 * chordAttacks <= attacks;
  if (hasToken(track, M1_BASS_NAME_TOKENS)) {
    return { role: "bass", ruleFired: "bass-by-token" };
  }
  if (hasToken(track, M1_MELODY_NAME_TOKENS)) {
    return { role: "melody", ruleFired: "melody-by-token" };
  }
  if (maxKey <= M1_BASS_MAX_KEY && monophonic) {
    return { role: "bass", ruleFired: "bass-by-register" };
  }
  if (monophonic && 2 * sumKeys >= 2 * M1_MELODY_MIN_MEAN_KEY * attacks) {
    return { role: "melody", ruleFired: "melody-by-line" };
  }
  return { role: "harmony", ruleFired: "harmony-otherwise" };
};

const checkClassification = (
  data: ClassificationFamily,
  label = "classification",
): void => {
  for (const kase of data.cases) {
    const got = classifyTrack(kase.track);
    if (got.role !== kase.expected.role) {
      fail(
        "classification-role",
        `${label}:${kase.name}`,
        `expected role ${kase.expected.role}, recomputed ${got.role}`,
      );
    }
    if (got.ruleFired !== kase.expected.ruleFired) {
      fail(
        "classification-rule",
        `${label}:${kase.name}`,
        `expected rule ${kase.expected.ruleFired}, recomputed ${got.ruleFired}`,
      );
    }
  }
};

/* ------------------------------------------------------------------ *
 * M1-SEG reference                                                    *
 * ------------------------------------------------------------------ */

const weightOf = (role: string): number =>
  role === "bass"
    ? M1_MASS_WEIGHT_BASS
    : role === "harmony"
      ? M1_MASS_WEIGHT_HARMONY
      : role === "melody"
        ? M1_MASS_WEIGHT_MELODY
        : 0;

type MeasureBound = readonly [number, number, number];

const measureBoundaries = (
  meterMap: readonly MeterEntry[],
  ppq: number,
  horizon: number,
): readonly MeasureBound[] => {
  const first = meterMap[0];
  const entries: readonly MeterEntry[] =
    first !== undefined && first.tick === 0
      ? meterMap
      : [{ tick: 0, numerator: 4, denominatorPower: 2 }, ...meterMap];
  const boundaries: MeasureBound[] = [];
  let measureIndex = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const beatUnit = 2 ** entry.denominatorPower;
    const lengthNumerator = entry.numerator * ppq * 4;
    if (lengthNumerator % beatUnit !== 0) {
      fail(
        "segmentation-fixture",
        `meter@${String(entry.tick)}`,
        "measure length is not an integer tick count for this ppq",
      );
      return boundaries;
    }
    const barTicks = lengthNumerator / beatUnit;
    const next = entries[index + 1];
    const segmentEnd = next === undefined ? Number.POSITIVE_INFINITY : next.tick;
    let start = entry.tick;
    while (start < segmentEnd && start < horizon) {
      const end = Math.min(start + barTicks, segmentEnd);
      boundaries.push([start, end, measureIndex]);
      measureIndex += 1;
      start = end;
    }
    if (segmentEnd >= horizon) break;
  }
  return boundaries;
};

type Contributor = Readonly<{ key: number; role: string }>;

const segmentSpans = (
  ppq: number,
  meterMap: readonly MeterEntry[],
  tracks: readonly RoleTrack[],
): readonly Span[] => {
  const minSounding = Math.floor(ppq / M1_MIN_SOUNDING_PPQ_DIVISOR);
  let horizon = 0;
  for (const track of tracks) {
    for (const note of track.notes) horizon = Math.max(horizon, note[3]);
  }
  const massOf = (
    a: number,
    b: number,
  ): Readonly<{ mass: readonly number[]; contributing: readonly Contributor[] }> => {
    const mass = new Array<number>(12).fill(0);
    const contributing: Contributor[] = [];
    for (const track of tracks) {
      const weight = weightOf(track.role);
      if (weight === 0) continue;
      for (const note of track.notes) {
        if (note[0] === M1_PERCUSSION_CHANNEL) continue;
        const overlap = Math.min(b, note[3]) - Math.max(a, note[2]);
        if (overlap <= 0) continue;
        if (overlap < minSounding && note[2] !== a) continue;
        const pc = pcOf(note[1]);
        mass[pc] = (mass[pc] ?? 0) + weight * overlap;
        contributing.push({ key: note[1], role: track.role });
      }
    }
    return { mass, contributing };
  };
  const presentOf = (mass: readonly number[]): readonly number[] => {
    const maxMass = Math.max(...mass);
    if (maxMass === 0) return [];
    const present: number[] = [];
    for (let pc = 0; pc < 12; pc += 1) {
      const value = mass[pc] ?? 0;
      if (value > 0 && 8 * value >= maxMass) present.push(pc);
    }
    return present;
  };
  const spans: Span[] = [];
  const emit = (
    measureIndex: number,
    depth: number,
    a: number,
    b: number,
  ): void => {
    const { mass, contributing } = massOf(a, b);
    const present = presentOf(mass);
    const silent = present.length === 0;
    if (!silent && depth < M1_MAX_SEGMENT_DEPTH) {
      const mid = a + Math.ceil((b - a) / 2);
      if (mid > a && mid < b) {
        const leftPresent = presentOf(massOf(a, mid).mass);
        const rightPresent = presentOf(massOf(mid, b).mass);
        /* A silent half contributes the empty set to the difference. */
        const union = new Set([...leftPresent, ...rightPresent]);
        let difference = 0;
        for (const pc of union) {
          if (leftPresent.includes(pc) !== rightPresent.includes(pc)) {
            difference += 1;
          }
        }
        if (difference >= M1_SEGMENT_SPLIT_MIN_DIFFERENCE) {
          emit(measureIndex, depth + 1, a, mid);
          emit(measureIndex, depth + 1, mid, b);
          return;
        }
      }
    }
    let bassKey: number | null = null;
    const bassNotes = contributing.filter((note) => note.role === "bass");
    const pool = bassNotes.length > 0 ? bassNotes : contributing;
    for (const note of pool) {
      if (bassKey === null || note.key < bassKey) bassKey = note.key;
    }
    spans.push(
      Object.freeze({
        measureIndex,
        depth,
        startTick: a,
        endTick: b,
        present,
        bass: bassKey === null ? null : pcOf(bassKey),
        silent,
      }),
    );
  };
  for (const [start, end, measureIndex] of measureBoundaries(
    meterMap,
    ppq,
    horizon,
  )) {
    emit(measureIndex, 0, start, end);
  }
  return spans;
};

const checkSegmentation = (
  data: SegmentationFamily,
  label = "segmentation",
): void => {
  for (const kase of data.cases) {
    const got = segmentSpans(kase.ppq, kase.meterMap, kase.tracks);
    const gotJson = canonicalJson(got);
    const expectedJson = canonicalJson(kase.expectedSpans);
    if (gotJson !== expectedJson) {
      fail(
        "segmentation-span",
        `${label}:${kase.name}`,
        `spans diverge; recomputed ${gotJson} vs fixture ${expectedJson}`,
      );
    }
  }
};

/* ------------------------------------------------------------------ *
 * M1-KEY reference                                                    *
 * ------------------------------------------------------------------ */

type KeyResult = Readonly<{
  tonicPitchClass: number;
  mode: "major" | "minor";
  score: number;
}> | null;

const inferKey = (masses: readonly number[]): KeyResult => {
  if (masses.every((mass) => mass === 0)) return null;
  let best:
    | Readonly<{ tonic: number; mode: "major" | "minor"; score: number }>
    | null = null;
  for (const mode of ["major", "minor"] as const) {
    const profile =
      mode === "major" ? M1_MAJOR_KEY_PROFILE : M1_MINOR_KEY_PROFILE;
    for (let tonic = 0; tonic < 12; tonic += 1) {
      let score = 0;
      for (let pc = 0; pc < 12; pc += 1) {
        score += (masses[pc] ?? 0) * (profile[(pc - tonic + 12) % 12] ?? 0);
      }
      const wins =
        best === null ||
        score > best.score ||
        (score === best.score && best.mode === "minor" && mode === "major") ||
        (score === best.score && best.mode === mode && tonic < best.tonic);
      if (wins) best = { tonic, mode, score };
    }
  }
  if (best === null) return null;
  return Object.freeze({
    tonicPitchClass: best.tonic,
    mode: best.mode,
    score: best.score,
  });
};

const tonicSpelling = (
  tonic: number,
  mode: "major" | "minor",
): Readonly<{ step: string; alter: number }> => {
  const table =
    mode === "major" ? M1_MAJOR_TONIC_SPELLINGS : M1_MINOR_TONIC_SPELLINGS;
  const spelling = table[tonic];
  if (spelling === undefined) {
    return { step: "C", alter: 0 };
  }
  return { step: spelling.step, alter: spelling.alter };
};

const checkKeys = (data: KeyFamily, label = "key"): void => {
  for (const kase of data.cases) {
    const got = inferKey(kase.masses);
    if (kase.expected === null) {
      if (got !== null) {
        fail(
          "key-winner",
          `${label}:${kase.name}`,
          `expected no key, recomputed ${canonicalJson(got)}`,
        );
      }
      continue;
    }
    if (got === null) {
      fail("key-winner", `${label}:${kase.name}`, "recomputed no key");
      continue;
    }
    if (
      got.tonicPitchClass !== kase.expected.tonicPitchClass ||
      got.mode !== kase.expected.mode
    ) {
      fail(
        "key-winner",
        `${label}:${kase.name}`,
        `expected ${String(kase.expected.tonicPitchClass)}/${kase.expected.mode}, recomputed ${String(got.tonicPitchClass)}/${got.mode}`,
      );
      continue;
    }
    const spelling = tonicSpelling(got.tonicPitchClass, got.mode);
    if (
      spelling.step !== kase.expected.spelling.step ||
      spelling.alter !== kase.expected.spelling.alter
    ) {
      fail(
        "key-spelling",
        `${label}:${kase.name}`,
        `expected ${canonicalJson(kase.expected.spelling)}, recomputed ${canonicalJson(spelling)}`,
      );
    }
    if (kase.equivariance) {
      for (let shift = 0; shift < 12; shift += 1) {
        const shifted = new Array<number>(12).fill(0);
        for (let pc = 0; pc < 12; pc += 1) {
          shifted[(pc + shift) % 12] = kase.masses[pc] ?? 0;
        }
        const transposed = inferKey(shifted);
        if (
          transposed === null ||
          transposed.mode !== got.mode ||
          transposed.tonicPitchClass !== (got.tonicPitchClass + shift) % 12
        ) {
          fail(
            "key-equivariance",
            `${label}:${kase.name}+${String(shift)}`,
            `transposition equivariance violated: ${canonicalJson(transposed)}`,
          );
        }
      }
    }
  }
};

/* ------------------------------------------------------------------ *
 * M1-KEY §4.2 re-ranking reference                                    *
 * ------------------------------------------------------------------ */

const rerank = (
  key: RerankKey,
  alternatives: readonly (readonly [number, string])[],
): readonly number[] => {
  const indices = alternatives.map((_, index) => index);
  if (key === null) return indices;
  const offsets: readonly number[] =
    key.mode === "major" ? M1_MAJOR_SCALE_OFFSETS : M1_MINOR_SCALE_OFFSETS;
  const diatonic = (rootPc: number): boolean =>
    offsets.includes((rootPc - key.tonicPitchClass + 12) % 12);
  return [...indices].sort((a, b) => {
    const left = alternatives[a];
    const right = alternatives[b];
    if (left === undefined || right === undefined) return a - b;
    const diaA = diatonic(left[0]) ? 0 : 1;
    const diaB = diatonic(right[0]) ? 0 : 1;
    if (diaA !== diaB) return diaA - diaB;
    const posA = left[1] === "root" ? 0 : 1;
    const posB = right[1] === "root" ? 0 : 1;
    if (posA !== posB) return posA - posB;
    return a - b;
  });
};

const checkRerank = (data: RerankFamily, label = "rerank"): void => {
  for (const kase of data.cases) {
    const got = rerank(kase.key, kase.alternatives);
    if (canonicalJson(got) !== canonicalJson(kase.expectedOrder)) {
      fail(
        "rerank-order",
        `${label}:${kase.name}`,
        `expected ${canonicalJson(kase.expectedOrder)}, recomputed ${canonicalJson(got)}`,
      );
    }
  }
};

/* ------------------------------------------------------------------ *
 * M1-GROOVE reference                                                 *
 * ------------------------------------------------------------------ */

type Features = Readonly<Record<string, Rational>>;

const decideGroove = (
  features: Features,
): Readonly<{ row: number; grooveStyleId: string }> => {
  for (const rule of M1_GROOVE_DECISION_TABLE) {
    let holds = true;
    for (const cond of rule.conditions) {
      const value = features[cond.feature];
      if (value === undefined) {
        holds = false;
        break;
      }
      const bound: Rational = [cond.value.numerator, cond.value.denominator];
      if (cond.comparator === "gte" && !ratGte(value, bound)) holds = false;
      if (cond.comparator === "lte" && !ratLte(value, bound)) holds = false;
      if (cond.comparator === "lt" && !ratLt(value, bound)) holds = false;
      if (cond.comparator === "between") {
        const upperSource = cond.upper;
        if (upperSource === null) {
          holds = false;
        } else {
          const upper: Rational = [
            upperSource.numerator,
            upperSource.denominator,
          ];
          if (!ratGte(value, bound) || !ratLte(value, upper)) holds = false;
        }
      }
      if (!holds) break;
    }
    if (holds) return { row: rule.row, grooveStyleId: rule.grooveStyleId };
  }
  throw new Error("decision table is not total");
};

const extractFeatures = (kase: FeatureCase): Features => {
  const ppq = kase.ppq;
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
  for (const track of kase.tracks) {
    for (const note of track.notes) {
      const role = track.role;
      if (role === "percussion" || role === "silent") continue;
      if (role === "melody") {
        melodyAttacks += 1;
        continue;
      }
      eligibleAttacks += 1;
      const position = note[2] % ppq;
      const inStraight =
        position >= straightCenter - half && position < straightCenter + half;
      const inSwung =
        position >= swungCenter - half && position <= swungCenter + half;
      if (inSwung) swung += 1;
      else if (inStraight || position === straightCenter + half) {
        // The shared boundary point belongs to the swung window; a strict
        // straight interval plus that point keeps the two windows disjoint.
        straight += 1;
      }
      if (!inSwung && !inStraight && position !== straightCenter + half) {
        const cell = Math.floor(ppq / 4);
        const cellIndex = Math.floor((2 * position + cell) / (2 * cell));
        if (cellIndex % 2 === 1) sixteenth += 1;
      }
      if (role === "harmony") harmonyInstants.add(note[2]);
      if (role === "bass") {
        const bar = Math.floor(note[2] / barTicks);
        const list = bassAttacksPerBar.get(bar) ?? [];
        list.push(note[2] - bar * barTicks);
        bassAttacksPerBar.set(bar, list);
      }
    }
  }
  for (const track of kase.tracks) {
    if (track.role !== "melody") continue;
    for (const note of track.notes) {
      if (harmonyInstants.has(note[2])) melodyCoincident += 1;
    }
  }
  const barCount = kase.barCount;
  let twoFeelBars = 0;
  for (let bar = 0; bar < barCount; bar += 1) {
    const attacks = bassAttacksPerBar.get(bar);
    if (attacks === undefined || attacks.length === 0) continue;
    const allOneAndThree = attacks.every((position) => {
      const beatIndex = Math.floor((2 * position + ppq) / (2 * ppq)) % 4;
      return beatIndex === 0 || beatIndex === 2;
    });
    if (allOneAndThree) twoFeelBars += 1;
  }
  const eighthTotal = swung + straight;
  return {
    tempoBpm: [Math.round(60_000_000 / kase.microsecondsPerQuarter), 1],
    swungShare: eighthTotal === 0 ? [0, 1] : [swung, eighthTotal],
    sixteenthShare:
      eligibleAttacks === 0 ? [0, 1] : [sixteenth, eligibleAttacks],
    attacksPerBar: [harmonyInstants.size, Math.max(1, barCount)],
    melodyCoincidence:
      melodyAttacks === 0 ? [0, 1] : [melodyCoincident, melodyAttacks],
    bassTwoFeel: barCount === 0 ? [0, 1] : [twoFeelBars, barCount],
  };
};

const checkGroove = (data: GrooveFamily, label = "groove"): void => {
  for (const kase of data.decisionCases) {
    const got = decideGroove(kase.features);
    if (
      got.row !== kase.expected.row ||
      got.grooveStyleId !== kase.expected.grooveStyleId
    ) {
      fail(
        "groove-decision",
        `${label}:${kase.name}`,
        `expected row ${String(kase.expected.row)} (${kase.expected.grooveStyleId}), recomputed row ${String(got.row)} (${got.grooveStyleId})`,
      );
    }
  }
  for (const kase of data.featureCases) {
    const got = extractFeatures(kase);
    for (const [name, expected] of Object.entries(kase.expectedFeatures)) {
      const value = got[name];
      if (value === undefined || !ratEq(value, expected)) {
        fail(
          "groove-feature",
          `${label}:${kase.name}:${name}`,
          `expected ${canonicalJson(expected)}, recomputed ${canonicalJson(value)}`,
        );
      }
    }
  }
};

/* ------------------------------------------------------------------ *
 * M1-XFER + M1-FORM reference                                         *
 * ------------------------------------------------------------------ */

const transferOutcome = (kase: TruthTableCase): JsonObject => {
  const starter = kase.destination === "starter";
  const grooveDefault = kase.documentGroove === "absent-default";
  return {
    tempo: starter ? "applied" : "withheld-stated",
    meter: starter ? "applied" : "withheld-stated",
    key: starter ? "applied" : "withheld-stated",
    title: starter ? "applied" : "withheld",
    groove: starter ? "applied" : grooveDefault ? "applied" : "withheld-stated",
    meterRefusalPredicted:
      !starter &&
      kase.fragmentUsesExplicitDurations &&
      kase.fileMeterDiffersFromDocument === true,
  };
};

const fileStem = (fileName: string): string => {
  const stem = fileName.replace(/\.(mid|midi)$/i, "").trim();
  return stem.length > 0 ? stem : "MIDI import";
};

const formSections = (
  kase: Readonly<{
    fileName: string;
    markers: readonly (readonly [number, string])[];
    ppq?: number;
  }>,
): readonly Readonly<{ name: string; startMeasureIndex: number }>[] => {
  const markers = kase.markers;
  if (markers.length === 0) {
    return [{ name: fileStem(kase.fileName), startMeasureIndex: 0 }];
  }
  const ppq = kase.ppq ?? 480;
  const barTicks = 4 * ppq;
  const sections: { name: string; startMeasureIndex: number }[] = [];
  const sorted = [...markers].sort((a, b) => a[0] - b[0]);
  const firstMarker = sorted[0];
  if (firstMarker !== undefined && firstMarker[0] > 0) {
    sections.push({ name: fileStem(kase.fileName), startMeasureIndex: 0 });
  }
  const seen = new Map<string, number>();
  let emptyOrdinal = 0;
  for (const [tick, rawText] of sorted) {
    const trimmed = rawText.trim();
    let name: string;
    if (trimmed.length === 0) {
      emptyOrdinal += 1;
      name = `Part ${String(emptyOrdinal)}`;
    } else {
      const count = (seen.get(trimmed) ?? 0) + 1;
      seen.set(trimmed, count);
      name = count === 1 ? trimmed : `${trimmed} (${String(count)})`;
    }
    sections.push({ name, startMeasureIndex: Math.floor(tick / barTicks) });
  }
  return sections;
};

const checkTransfer = (data: TransferFamily, label = "transfer"): void => {
  for (const kase of data.truthTableCases) {
    const got = transferOutcome(kase);
    if (canonicalJson(got) !== canonicalJson(kase.expected)) {
      fail(
        "transfer-truth-table",
        `${label}:${kase.name}`,
        `expected ${canonicalJson(kase.expected)}, recomputed ${canonicalJson(got)}`,
      );
    }
  }
  for (const kase of data.markerCases) {
    const got = formSections(kase);
    if (canonicalJson(got) !== canonicalJson(kase.expectedSections)) {
      fail(
        "form-sections",
        `${label}:${kase.name}`,
        `expected ${canonicalJson(kase.expectedSections)}, recomputed ${canonicalJson(got)}`,
      );
    }
  }
};

/* ------------------------------------------------------------------ *
 * M1-ENV reference                                                    *
 * ------------------------------------------------------------------ */

const chunkFragment = (kase: ChunkingCase): JsonObject => {
  const pieces = kase.measureTextCodePoints;
  const chunks: number[] = [];
  let current = 0;
  let running = kase.sectionHeaderCodePoints;
  for (const piece of pieces) {
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
    return {
      chunkCount: null,
      chunkMeasureCounts: null,
      refusal: "import.automation_chart_too_large",
    };
  }
  return {
    chunkCount: chunks.length,
    chunkMeasureCounts: chunks,
    refusal: null,
  };
};

const envelopeRun = (kase: EnvelopeRunCase): JsonObject => {
  /*
   * Amendment #1 (jcpe-9m5q): settings applicable means a starter
   * destination, and a starter issues its settings BEFORE the insert —
   * the meter law locks the meter once any chord exists, so insert-first
   * made every non-4/4 starter import roll back. Groove stays last.
   */
  const planned: string[] = [];
  if (kase.commandsApplicable.settings) planned.push("settings");
  for (
    let index = 0;
    index < kase.commandsApplicable.insertChunks;
    index += 1
  ) {
    planned.push("insert");
  }
  if (kase.commandsApplicable.groove) planned.push("groove");
  if (kase.refusalAtIndex === null) {
    return {
      issuedOrder: planned,
      statedUndoCount: planned.length,
      rolledBackCount: 0,
    };
  }
  const issued = planned.slice(0, kase.refusalAtIndex);
  return {
    issuedOrder: issued,
    statedUndoCount: 0,
    rolledBackCount: issued.length,
    refusal: "import.automation_envelope_rolled_back",
  };
};

const checkEnvelope = (data: EnvelopeFamily, label = "envelope"): void => {
  for (const kase of data.chunkingCases) {
    const got = chunkFragment(kase);
    if (canonicalJson(got) !== canonicalJson(kase.expected)) {
      fail(
        "envelope-chunking",
        `${label}:${kase.name}`,
        `expected ${canonicalJson(kase.expected)}, recomputed ${canonicalJson(got)}`,
      );
    }
  }
  for (const kase of data.envelopeCases) {
    const got = envelopeRun(kase);
    if (canonicalJson(got) !== canonicalJson(kase.expected)) {
      fail(
        "envelope-order",
        `${label}:${kase.name}`,
        `expected ${canonicalJson(kase.expected)}, recomputed ${canonicalJson(got)}`,
      );
    }
  }
};

/* ------------------------------------------------------------------ *
 * Mutation harness                                                    *
 * ------------------------------------------------------------------ */

type FamilyChecker = (data: never, label?: string) => void;

const FAMILY_CHECKERS: Readonly<Record<string, FamilyChecker>> = {
  "classification-cases": checkClassification,
  "segmentation-cases": checkSegmentation,
  "key-cases": checkKeys,
  "rerank-cases": checkRerank,
  "groove-cases": checkGroove,
  "transfer-cases": checkTransfer,
  "envelope-cases": checkEnvelope,
};

const setPath = (target: unknown, path: string, value: unknown): boolean => {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((part) => part.length > 0);
  let cursor: unknown = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (part === undefined) return false;
    if (Array.isArray(cursor)) cursor = cursor[Number(part)];
    else if (typeof cursor === "object" && cursor !== null)
      cursor = (cursor as JsonObject)[part];
    else return false;
    if (cursor === undefined || cursor === null) return false;
  }
  const last = parts[parts.length - 1];
  if (last === undefined) return false;
  if (Array.isArray(cursor)) {
    cursor[Number(last)] = value;
    return true;
  }
  if (typeof cursor === "object" && cursor !== null) {
    const record = cursor as JsonObject;
    if (!(last in record)) return false;
    record[last] = value;
    return true;
  }
  return false;
};

const caseListsOf = (family: unknown): readonly unknown[][] => {
  const record = family as JsonObject;
  const lists: unknown[][] = [];
  for (const key of [
    "cases",
    "decisionCases",
    "featureCases",
    "truthTableCases",
    "markerCases",
    "chunkingCases",
    "envelopeCases",
  ]) {
    const list = record[key];
    if (Array.isArray(list)) lists.push(list);
  }
  return lists;
};

const runMutations = (families: Readonly<Record<string, unknown>>): void => {
  const data = readJson("mutation-controls.json") as MutationFamily;
  for (const mutation of data.mutations) {
    const family = families[mutation.family];
    const checker = FAMILY_CHECKERS[mutation.family];
    if (family === undefined || checker === undefined) {
      fail("mutation-harness", mutation.name, "unknown family");
      continue;
    }
    const clone: unknown = JSON.parse(JSON.stringify(family));
    let target: unknown = null;
    for (const list of caseListsOf(clone)) {
      for (const kase of list) {
        const record = kase as JsonObject;
        if (record["name"] === mutation.caseName) target = kase;
      }
    }
    if (target === null) {
      fail("mutation-harness", mutation.name, "case not found");
      continue;
    }
    if (!setPath(target, mutation.path, mutation.value)) {
      fail(
        "mutation-harness",
        mutation.name,
        `path ${mutation.path} not found`,
      );
      continue;
    }
    const before = findings.length;
    (checker as (data: unknown, label?: string) => void)(
      clone,
      `mutation:${mutation.name}`,
    );
    const produced = findings.splice(before);
    const caught = produced.some((finding) =>
      finding.check.startsWith(mutation.expectedCheck),
    );
    if (!caught) {
      fail(
        "mutation-survived",
        mutation.name,
        `mutation was not caught by ${mutation.expectedCheck} (got ${
          produced.map((finding) => finding.check).join(",") || "nothing"
        })`,
      );
    }
  }
};

/* ------------------------------------------------------------------ *
 * Trace golden + manifest                                             *
 * ------------------------------------------------------------------ */

const GOLDEN_TRACKS: readonly (TrackInput & RoleTrack)[] = [
  {
    name: "Piano",
    instrumentName: null,
    role: "harmony",
    notes: [
      [0, 62, 0, 960],
      [0, 65, 0, 960],
      [0, 69, 0, 960],
      [0, 72, 0, 960],
      [0, 55, 960, 1920],
      [0, 59, 960, 1920],
      [0, 65, 960, 1920],
    ],
  },
  {
    name: "Bass",
    instrumentName: null,
    role: "bass",
    notes: [
      [1, 38, 0, 900],
      [1, 43, 960, 1860],
    ],
  },
];

const GOLDEN_SCENARIO = {
  name: "small-band-golden",
  ppq: 480,
  microsecondsPerQuarter: 500000,
  barCount: 1,
  meterMap: [{ tick: 0, numerator: 4, denominatorPower: 2 }] as const,
  fileName: "golden.mid",
  markers: [] as readonly (readonly [number, string])[],
  tracks: GOLDEN_TRACKS,
} as const;

type TraceDecision = Readonly<{
  subject: string;
  outcome: string;
  reason: string;
}>;

const buildGoldenTrace = (): unknown => {
  const records: unknown[] = [];
  const push = (
    stage: string,
    input: unknown,
    workCounters: Readonly<Record<string, number>>,
    decisions: readonly TraceDecision[],
  ): void => {
    records.push({
      stage,
      inputDigest: fnv1a64(canonicalJson(input)),
      workCounters,
      decisions,
      refusalCode: null,
    });
  };
  push(
    "decode",
    { source: "fixture", name: GOLDEN_SCENARIO.name },
    { notes: 9, tracks: 2 },
    [
      {
        subject: "decode",
        outcome: "fixture-model",
        reason: "spec golden starts from a decoded model, not bytes",
      },
    ],
  );
  push("salvage", { attempted: false }, { repairs: 0 }, [
    {
      subject: "salvage",
      outcome: "not-attempted",
      reason: "the decode succeeded without content repairs",
    },
  ]);
  const classifications = GOLDEN_SCENARIO.tracks.map((track, index) => ({
    trackIndex: index,
    ...classifyTrack(track),
  }));
  push(
    "classify",
    GOLDEN_SCENARIO.tracks.map((track) => ({
      name: track.name,
      notes: track.notes,
    })),
    { tracks: GOLDEN_SCENARIO.tracks.length },
    classifications.map((entry) => ({
      subject: `track-${String(entry.trackIndex)}`,
      outcome: entry.role,
      reason: entry.ruleFired,
    })),
  );
  const spans = segmentSpans(
    GOLDEN_SCENARIO.ppq,
    GOLDEN_SCENARIO.meterMap,
    GOLDEN_SCENARIO.tracks,
  );
  push(
    "segment",
    spans,
    { spans: spans.length },
    spans.map((span) => ({
      subject: `measure-${String(span.measureIndex)}@${String(span.startTick)}`,
      outcome: span.silent
        ? "silent"
        : `present:${span.present.map(String).join("+")}`,
      reason: `depth ${String(span.depth)}`,
    })),
  );
  const masses = new Array<number>(12).fill(0);
  for (const span of spans) {
    for (const pc of span.present) masses[pc] = (masses[pc] ?? 0) + 1;
  }
  const key = inferKey(masses);
  push("infer-key", masses, { candidates: 24 }, [
    {
      subject: "key",
      outcome:
        key === null
          ? "none"
          : `${String(key.tonicPitchClass)}/${key.mode}`,
      reason: "highest frozen-profile score",
    },
  ]);
  push(
    "resolve",
    spans.map((span) => span.present),
    { spans: spans.length },
    [
      {
        subject: "resolution",
        outcome: "m0-resolveSonority-plus-m1-rerank",
        reason: "resolution law is M0's, re-ranked under the inferred key",
      },
    ],
  );
  const features = extractFeatures({
    name: GOLDEN_SCENARIO.name,
    ppq: GOLDEN_SCENARIO.ppq,
    microsecondsPerQuarter: GOLDEN_SCENARIO.microsecondsPerQuarter,
    barCount: GOLDEN_SCENARIO.barCount,
    tracks: GOLDEN_SCENARIO.tracks,
    expectedFeatures: {},
  });
  const groove = decideGroove(features);
  push("groove", features, { rows: M1_GROOVE_DECISION_TABLE.length }, [
    {
      subject: "groove",
      outcome: groove.grooveStyleId,
      reason: `decision row ${String(groove.row)}`,
    },
  ]);
  const sections = formSections({
    markers: GOLDEN_SCENARIO.markers,
    fileName: GOLDEN_SCENARIO.fileName,
    ppq: GOLDEN_SCENARIO.ppq,
  });
  push(
    "plan",
    sections,
    { sections: sections.length },
    sections.map((section) => ({
      subject: section.name,
      outcome: `starts-at-measure-${String(section.startMeasureIndex)}`,
      reason: "M1-FORM",
    })),
  );
  push(
    "envelope",
    { insertChunks: 1, settings: true, groove: true },
    { commands: 3 },
    [
      {
        subject: "envelope",
        outcome: "settings,insert,groove",
        reason:
          "destination-dependent frozen order on a starter destination (amendment #1, jcpe-9m5q)",
      },
    ],
  );
  return { schema: M1_AUTOMATION_TRACE_SCHEMA, records };
};

const FAMILY_FILES = [
  "classification-cases.json",
  "segmentation-cases.json",
  "key-cases.json",
  "rerank-cases.json",
  "groove-cases.json",
  "transfer-cases.json",
  "envelope-cases.json",
  "mutation-controls.json",
] as const;

const buildManifest = (): unknown => ({
  schema: M1_AUTOMATION_CONTRACT_SCHEMA,
  packet: "jcpe-ionn",
  document: "docs/M1_MIDI_IMPORT_AUTOMATION_CONTRACT.md",
  traceStages: [...M1_TRACE_STAGES],
  families: FAMILY_FILES.map((file) => ({
    file,
    sha256: sha256(readFileSync(join(FIXTURE_DIR, file))),
  })),
  traceGolden: {
    file: "trace-golden.json",
    sha256: sha256(readFileSync(join(FIXTURE_DIR, "trace-golden.json"))),
  },
});

/* ------------------------------------------------------------------ *
 * Main                                                                *
 * ------------------------------------------------------------------ */

const families: Record<string, unknown> = {};
for (const file of FAMILY_FILES) {
  families[file.replace(".json", "")] = readJson(file);
}

checkClassification(families["classification-cases"] as ClassificationFamily);
checkSegmentation(families["segmentation-cases"] as SegmentationFamily);
checkKeys(families["key-cases"] as KeyFamily);
checkRerank(families["rerank-cases"] as RerankFamily);
checkGroove(families["groove-cases"] as GrooveFamily);
checkTransfer(families["transfer-cases"] as TransferFamily);
checkEnvelope(families["envelope-cases"] as EnvelopeFamily);
runMutations(families);

if (emitPending) {
  const trace = buildGoldenTrace();
  writeFileSync(
    join(FIXTURE_DIR, "trace-golden.json"),
    `${JSON.stringify(trace, null, 2)}\n`,
  );
  const manifest = buildManifest();
  writeFileSync(
    join(FIXTURE_DIR, "m1-contract.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
} else {
  try {
    const expectedTrace = readJson("trace-golden.json");
    const recomputedTrace = buildGoldenTrace();
    if (canonicalJson(expectedTrace) !== canonicalJson(recomputedTrace)) {
      fail(
        "trace-golden",
        "trace-golden.json",
        "recomputed golden trace differs from the pinned file",
      );
    }
    const manifest = readJson("m1-contract.json");
    const rebuilt = buildManifest();
    if (canonicalJson(manifest) !== canonicalJson(rebuilt)) {
      fail(
        "manifest-digest",
        "m1-contract.json",
        "family digests or manifest fields drifted from the pinned packet",
      );
    }
  } catch (error) {
    fail(
      "packet-missing",
      "m1-contract.json/trace-golden.json",
      `packet files unreadable: ${String(error)}`,
    );
  }
}

const summary = {
  validator: "validate-m1-contract",
  mode: emitPending ? "emit-pending" : "frozen",
  families: FAMILY_FILES.length,
  findings,
};
console.log(JSON.stringify(summary, null, 2));
if (findings.length > 0) process.exit(1);
