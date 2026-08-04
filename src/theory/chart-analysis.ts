import {
  pitchClassOf,
  SPELLING_STEP_ORDER,
  type ChordDegree,
  type ChordSpec,
  type CustomChordSpec,
  type KeyContext,
  type PitchClass,
  type SpelledPitchClass,
} from "../domain";

import {
  CHART_ANALYSIS_ENGINE_VERSION,
  MAX_CHART_GUIDE_TONE_MOVES,
  MAX_CHART_NEXT_OPTIONS,
  MAX_CHART_PHRASES_PER_SECTION,
  MAX_CHART_PHRASE_EVENTS,
  type AnalyzeChartEventRequest,
  type ChartChordDetail,
  type ChartEventAnalysis,
  type ChartGuideToneMove,
  type ChartHarmonicKind,
  type ChartNextOption,
  type ChartPhrase,
  type ChartPhrasesResult,
  type ChartToneView,
  type DeriveChordDetailRequest,
  type DetectChartPhrasesRequest,
} from "./chart-analysis-contract";
import type {
  ResolutionOperations,
  ResolvedChord,
} from "./resolution-contract";

/**
 * Deterministic chart annotation from literal chord facts.
 *
 * Pure by construction: the inputs are exact stored specs, the document key,
 * and the injected T1 resolution oracle (the V2 idiom — theory receives its
 * collaborators, it never imports application or content). Same request and
 * oracle, same bytes out. Every claim degrades honestly: no key means no
 * roman numeral and no functional sentence, a custom chord means no degree
 * talk at all, and a refused resolution is said out loud rather than papered
 * over with a pitch-class guess.
 */

const MAJOR_DEGREE_SEMITONES = Object.freeze([0, 2, 4, 5, 7, 9, 11] as const);
const NUMERALS = Object.freeze(["I", "II", "III", "IV", "V", "VI", "VII"] as const);
/** Pitch-class fallback numerals, flat-preferred like the engraving. */
const PC_NUMERALS = Object.freeze([
  "I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII",
] as const);

/** ASCII names for emitted symbols; the T0 grammar reads these directly. */
const FLAT_NAMES = Object.freeze([
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
] as const);
const SHARP_NAMES = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const);

function pc(value: number): number {
  return ((value % 12) + 12) % 12;
}

function alterGlyphs(alter: number): string {
  if (alter <= -1) return "♭".repeat(-alter);
  if (alter >= 1) return "♯".repeat(alter);
  return "";
}

/** Display name with Unicode accidentals ("B♭"). */
function displayName(spelled: SpelledPitchClass): string {
  return `${spelled.step}${alterGlyphs(spelled.alter)}`;
}

function toDisplay(ascii: string): string {
  return ascii.replaceAll("#", "♯").replaceAll("b", "♭");
}

/**
 * Whether pitch-class names should prefer flats. Flat-side and F tonics
 * spell flat; sharp-side tonics spell sharp; with no key, flats win — the
 * default the engraving tradition reads most easily.
 */
function preferFlats(key: KeyContext | null): boolean {
  if (key === null) return true;
  if (key.tonic.alter < 0) return true;
  if (key.tonic.alter > 0) return false;
  return key.tonic.step === "F";
}

function asciiNameFor(pitchClass: number, flats: boolean): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc(pitchClass)] ?? "C";
}

function keyNameFor(pitchClass: number, flats: boolean, minor: boolean): string {
  return `${toDisplay(asciiNameFor(pitchClass, flats))}${minor ? " minor" : ""}`;
}

/* ------------------------------------------------------------ predicates */

function isParsed(spec: ChordSpec | CustomChordSpec): spec is ChordSpec {
  return spec.kind === "parsed";
}

function isDominantSpec(spec: ChordSpec): boolean {
  return spec.triad === "major" && spec.seventh === "minor";
}

function isMinorSeventhSpec(spec: ChordSpec): boolean {
  return spec.triad === "minor" && spec.seventh === "minor";
}

function isHalfDiminishedSpec(spec: ChordSpec): boolean {
  return spec.triad === "diminished" && spec.seventh === "minor";
}

function isDiminishedSpec(spec: ChordSpec): boolean {
  return (
    spec.triad === "diminished" &&
    (spec.seventh === "diminished" || spec.seventh === null)
  );
}

/** A major-family tonic sound: maj7 or 6 colour and no dominant seventh. */
function isMajorTonicSpec(spec: ChordSpec): boolean {
  return (
    spec.triad === "major" &&
    spec.seventh !== "minor" &&
    (spec.seventh === "major" || spec.sixth !== null)
  );
}

function isMinorTonicSpec(spec: ChordSpec): boolean {
  return spec.triad === "minor";
}

function isTonicSpec(spec: ChordSpec): boolean {
  return isMajorTonicSpec(spec) || isMinorTonicSpec(spec);
}

function isSuspendedSpec(spec: ChordSpec): boolean {
  return spec.triad === "sus2" || spec.triad === "sus4";
}

function hasDegree(
  degrees: readonly ChordDegree[],
  number: number,
  alter: number,
): boolean {
  return degrees.some(
    (degree) => degree.number === number && degree.alter === alter,
  );
}

function isAlteredDominantSpec(spec: ChordSpec): boolean {
  if (spec.colorPolicy === "altered-dominant") return true;
  return (
    hasDegree(spec.alterations, 9, -1) ||
    hasDegree(spec.alterations, 9, 1) ||
    hasDegree(spec.alterations, 5, 1) ||
    hasDegree(spec.alterations, 13, -1)
  );
}

function hasSharpEleven(spec: ChordSpec): boolean {
  return (
    hasDegree(spec.alterations, 11, 1) ||
    hasDegree(spec.extensions, 11, 1) ||
    hasDegree(spec.additions, 11, 1)
  );
}

/* ----------------------------------------------------------------- roman */

function suffixFor(spec: ChordSpec): string {
  if (spec.triad === "diminished" && spec.seventh === "diminished") return "°7";
  if (spec.triad === "diminished" && spec.seventh === "minor") return "ø7";
  if (spec.seventh === "major") return "maj7";
  if (spec.seventh === "minor") return "7";
  if (spec.sixth !== null) return "6";
  return "";
}

function isLowercaseSpec(spec: ChordSpec): boolean {
  return spec.triad === "minor" || spec.triad === "diminished";
}

function pcNumeral(distance: number, lowercase: boolean): string {
  const base = PC_NUMERALS[pc(distance)] ?? "I";
  return lowercase ? base.toLowerCase() : base;
}

/**
 * Roman numeral from the SPELLED letters of tonic and root: the letter
 * distance names the degree, and the sounding distance beyond the major
 * scale's expectation becomes the accidental prefix. A spelling too remote
 * for two accidentals falls back to the flat-preferred pitch-class table.
 */
function romanFor(key: KeyContext, spec: ChordSpec): string {
  const tonicIndex = SPELLING_STEP_ORDER.indexOf(key.tonic.step);
  const rootIndex = SPELLING_STEP_ORDER.indexOf(spec.root.step);
  const lowercase = isLowercaseSpec(spec);
  const suffix = suffixFor(spec);
  const actual = pc(pitchClassOf(spec.root) - pitchClassOf(key.tonic));
  if (tonicIndex < 0 || rootIndex < 0) {
    return `${pcNumeral(actual, lowercase)}${suffix}`;
  }
  const degreeIndex = (rootIndex - tonicIndex + 7) % 7;
  const expected = MAJOR_DEGREE_SEMITONES[degreeIndex] ?? 0;
  const delta = ((actual - expected + 18) % 12) - 6;
  if (delta < -2 || delta > 2) {
    return `${pcNumeral(actual, lowercase)}${suffix}`;
  }
  const numeral = NUMERALS[degreeIndex] ?? "I";
  const cased = lowercase ? numeral.toLowerCase() : numeral;
  return `${alterGlyphs(delta)}${cased}${suffix}`;
}

/* ------------------------------------------------------------- analysis */

function qualityScale(spec: ChordSpec): string | null {
  const root = displayName(spec.root);
  if (isDominantSpec(spec)) {
    return isAlteredDominantSpec(spec) ? `${root} altered` : `${root} Mixolydian`;
  }
  if (isHalfDiminishedSpec(spec)) return `${root} Locrian`;
  if (isDiminishedSpec(spec)) return `${root} whole–half diminished`;
  if (spec.triad === "minor") return `${root} Dorian`;
  if (spec.triad === "major" && (spec.seventh === "major" || spec.sixth !== null)) {
    return hasSharpEleven(spec) ? `${root} Lydian` : `${root} Ionian`;
  }
  if (isSuspendedSpec(spec)) return `${root} Mixolydian`;
  return null;
}

const UNKEYED_SENTENCE =
  "No key is set, so no functional reading is claimed.";
const CUSTOM_SENTENCE = "A custom chord carries no degree analysis.";
const REFUSED_SENTENCE =
  "This chord symbol did not resolve, so nothing is claimed about it.";

function frozenAnalysis(
  outcome: ChartEventAnalysis["outcome"],
  kind: ChartHarmonicKind | null,
  roman: string | null,
  functionSentence: string,
  scaleSentence: string | null,
): ChartEventAnalysis {
  return Object.freeze({
    engineVersion: CHART_ANALYSIS_ENGINE_VERSION,
    outcome,
    kind,
    roman,
    functionSentence,
    scaleSentence,
  });
}

export function analyzeChartEvent(
  request: AnalyzeChartEventRequest,
  operations: ResolutionOperations,
): ChartEventAnalysis {
  const { current, key } = request;
  if (!isParsed(current)) {
    return frozenAnalysis("custom-chord", null, null, CUSTOM_SENTENCE, null);
  }
  const resolved = operations.resolveChord(current);
  if (!resolved.ok) {
    return frozenAnalysis(
      "resolution-refused",
      null,
      null,
      REFUSED_SENTENCE,
      null,
    );
  }
  const scale = qualityScale(current);
  if (key === null) {
    return frozenAnalysis("unkeyed", null, null, UNKEYED_SENTENCE, scale);
  }

  const keyPc = pitchClassOf(key.tonic);
  const rootPc = pitchClassOf(current.root);
  const degree = pc(rootPc - keyPc);
  const root = displayName(current.root);
  const roman = romanFor(key, current);

  let kind: ChartHarmonicKind = "colour";
  let sentence = "Colour chord";
  let keyedScale = scale;

  if (isDominantSpec(current)) {
    kind = "dominant";
    if (degree === 7) {
      sentence = "Dominant — pulls home to the tonic";
      keyedScale = `${root} Mixolydian`;
    } else if (degree === 1) {
      sentence = "Tritone substitute for the V7";
      keyedScale = `${root} Lydian dominant`;
    } else {
      const target = pcNumeral(pc(rootPc + 5 - keyPc), false);
      sentence = `Secondary dominant — the V7 of ${target}`;
      keyedScale = `${root} Mixolydian`;
    }
    if (isAlteredDominantSpec(current)) keyedScale = `${root} altered`;
  } else if (isHalfDiminishedSpec(current)) {
    kind = "predominant";
    sentence = "Half-diminished — usually the ii of a minor ii–V";
    keyedScale = `${root} Locrian`;
  } else if (isDiminishedSpec(current)) {
    sentence = "Diminished — passing chord or dominant substitute";
    keyedScale = `${root} whole–half diminished`;
  } else if (current.triad === "minor") {
    kind = degree === 2 ? "predominant" : "colour";
    sentence =
      degree === 2
        ? "Predominant — the ii of a ii–V"
        : degree === 9
          ? "Relative minor — a softer tonic"
          : degree === 4
            ? "iii — tonic-adjacent colour"
            : "Minor colour";
    keyedScale =
      `${root} ${degree === 2 || degree === 9 ? "Dorian" : "Aeolian"}`;
  } else if (
    current.triad === "major" &&
    (current.seventh === "major" || current.sixth !== null)
  ) {
    kind = degree === 0 ? "tonic" : "colour";
    sentence =
      degree === 0
        ? "Tonic — home"
        : degree === 5
          ? "Subdominant — lifts away from home"
          : degree === 8 || degree === 3 || degree === 10
            ? "Borrowed from the parallel minor"
            : "Major colour";
    keyedScale =
      `${root} ${hasSharpEleven(current) || degree === 5 ? "Lydian" : "Ionian"}`;
  } else if (isSuspendedSpec(current)) {
    sentence = "Suspended — the third is withheld";
    keyedScale = `${root} Mixolydian`;
  }

  return Object.freeze({
    engineVersion: CHART_ANALYSIS_ENGINE_VERSION,
    outcome: "analyzed" as const,
    kind,
    roman,
    functionSentence: sentence,
    scaleSentence: keyedScale,
  });
}

/* -------------------------------------------------------------- phrases */

type PhraseFacts = Readonly<{
  matchable: boolean;
  rootPc: number;
  pre: boolean;
  dom: boolean;
  minorTonic: boolean;
  tonic: boolean;
  majorTonicHead: boolean;
  minorSeventh: boolean;
}>;

function phraseFacts(spec: ChordSpec | CustomChordSpec): PhraseFacts {
  if (!isParsed(spec)) {
    return Object.freeze({
      matchable: false,
      rootPc: 0,
      pre: false,
      dom: false,
      minorTonic: false,
      tonic: false,
      majorTonicHead: false,
      minorSeventh: false,
    });
  }
  const pre = isMinorSeventhSpec(spec) || isHalfDiminishedSpec(spec);
  return Object.freeze({
    matchable: true,
    rootPc: pitchClassOf(spec.root),
    pre,
    dom: isDominantSpec(spec),
    minorTonic: isMinorTonicSpec(spec),
    tonic: isTonicSpec(spec),
    majorTonicHead: isMajorTonicSpec(spec),
    minorSeventh: isMinorSeventhSpec(spec),
  });
}

export function detectChartPhrases(
  request: DetectChartPhrasesRequest,
): ChartPhrasesResult {
  const events = request.events.slice(0, MAX_CHART_PHRASE_EVENTS);
  const flats = preferFlats(request.key);
  const facts = events.map(phraseFacts);
  const nm = (pitchClass: number, minor = false): string =>
    keyNameFor(pitchClass, flats, minor);
  const up = (fact: PhraseFacts, semitones: number): number =>
    pc(fact.rootPc + semitones);

  const phrases: ChartPhrase[] = [];
  let detectorAttempts = 0;
  let index = 0;
  while (index < facts.length && phrases.length < MAX_CHART_PHRASES_PER_SECTION) {
    const a = facts[index];
    const b = facts[index + 1];
    const c = facts[index + 2];
    const d = facts[index + 3];
    if (a === undefined || !a.matchable) {
      index += 1;
      continue;
    }
    detectorAttempts += 1;
    /* Greedy precedence, exactly the pencilled-marking order: the pattern a
     * teacher brackets first wins the events it covers. */
    if (
      a.majorTonicHead &&
      b?.matchable === true && b.minorSeventh &&
      c?.matchable === true && c.pre &&
      d?.matchable === true && d.dom &&
      b.rootPc === up(a, 9) &&
      c.rootPc === up(a, 2) &&
      d.rootPc === up(a, 7)
    ) {
      phrases.push(Object.freeze({
        kind: "turnaround" as const,
        fromIndex: index,
        toIndex: index + 3,
        label: `turnaround in ${nm(a.rootPc)}`,
      }));
      index += 4;
      continue;
    }
    if (
      a.pre &&
      b?.matchable === true && b.dom &&
      c?.matchable === true && c.tonic &&
      b.rootPc === up(a, 5) &&
      (c.rootPc === up(b, 5) || c.rootPc === up(b, 11))
    ) {
      phrases.push(Object.freeze({
        kind: "two-five-one" as const,
        fromIndex: index,
        toIndex: index + 2,
        label: `ii–V–I in ${nm(c.rootPc, c.minorTonic)}`,
      }));
      index += 3;
      continue;
    }
    if (a.pre && b?.matchable === true && b.dom && b.rootPc === up(a, 5)) {
      phrases.push(Object.freeze({
        kind: "two-five" as const,
        fromIndex: index,
        toIndex: index + 1,
        label: `ii–V of ${nm(up(b, 5))}`,
      }));
      index += 2;
      continue;
    }
    if (
      a.dom &&
      b?.matchable === true && b.tonic &&
      b.rootPc === up(a, 11)
    ) {
      phrases.push(Object.freeze({
        kind: "tritone-substitution" as const,
        fromIndex: index,
        toIndex: index + 1,
        label: `tritone sub into ${nm(b.rootPc, b.minorTonic)}`,
      }));
      index += 2;
      continue;
    }
    if (a.dom && b?.matchable === true && b.tonic && b.rootPc === up(a, 5)) {
      phrases.push(Object.freeze({
        kind: "five-one" as const,
        fromIndex: index,
        toIndex: index + 1,
        label: `V–I in ${nm(b.rootPc, b.minorTonic)}`,
      }));
      index += 2;
      continue;
    }
    if (a.dom && b?.matchable === true && b.dom && b.rootPc === up(a, 5)) {
      phrases.push(Object.freeze({
        kind: "dominant-chain" as const,
        fromIndex: index,
        toIndex: index + 1,
        label: "dominant chain",
      }));
      index += 2;
      continue;
    }
    index += 1;
  }

  return Object.freeze({
    engineVersion: CHART_ANALYSIS_ENGINE_VERSION,
    phrases: Object.freeze(phrases),
    evidence: Object.freeze({
      eventsExamined: facts.length,
      detectorAttempts,
      phrasesEmitted: phrases.length,
      termination: "complete" as const,
    }),
  });
}

/* --------------------------------------------------------------- detail */

type GuideTone = Readonly<{
  name: string;
  pitchClass: PitchClass;
}>;

function realizationOf(resolved: ResolvedChord) {
  return resolved.realizations[0];
}

function roleLabel(degree: ChordDegree): string {
  if (degree.number === 1 && degree.alter === 0) return "root";
  return `${alterGlyphs(degree.alter)}${String(degree.number)}`;
}

function isGuideDegree(
  degree: ChordDegree,
  guideToneDegrees: readonly ChordDegree[],
): boolean {
  return guideToneDegrees.some(
    (guide) => guide.number === degree.number && guide.alter === degree.alter,
  );
}

function guideTonesOf(resolved: ResolvedChord): readonly GuideTone[] {
  const realization = realizationOf(resolved);
  if (realization.degrees === null || realization.guideToneDegrees === null) {
    return Object.freeze([]);
  }
  const tones: GuideTone[] = [];
  realization.degrees.forEach((degree, index) => {
    if (!isGuideDegree(degree, realization.guideToneDegrees ?? [])) return;
    const spelled = realization.spelledPitchNames[index];
    const pitchClass = realization.pitchClasses[index];
    if (spelled === undefined || pitchClass === undefined) return;
    tones.push(Object.freeze({ name: displayName(spelled), pitchClass }));
  });
  return Object.freeze(tones.slice(0, MAX_CHART_GUIDE_TONE_MOVES));
}

function resolutionNote(held: number, step: number, total: number): string {
  if (step > 0 && held > 0) return `${String(held)} held, ${String(step)} by step`;
  if (step > 0) return "both move by step";
  if (held === total) return "both notes are common to each chord";
  return "the guide tones leap";
}

function deriveResolution(
  current: ResolvedChord,
  next: ResolvedChord,
  targetSymbol: string,
): ChartChordDetail["resolution"] {
  const from = guideTonesOf(current);
  const to = guideTonesOf(next);
  if (from.length === 0 || to.length === 0) return null;
  const moves: ChartGuideToneMove[] = from.map((tone) => {
    let best = to[0] as GuideTone;
    let distance = 99;
    for (const target of to) {
      const forward = pc(target.pitchClass - tone.pitchClass);
      const spread = Math.min(forward, 12 - forward);
      if (spread < distance) {
        distance = spread;
        best = target;
      }
    }
    return Object.freeze({
      fromName: tone.name,
      toName: best.name,
      fromPitchClass: tone.pitchClass,
      toPitchClass: best.pitchClass,
      distance,
      motion:
        distance === 0
          ? ("held" as const)
          : distance <= 2
            ? ("step" as const)
            : ("leap" as const),
    });
  });
  const held = moves.filter((move) => move.motion === "held").length;
  const step = moves.filter((move) => move.motion === "step").length;
  return Object.freeze({
    targetSymbol,
    moves: Object.freeze(moves),
    note: resolutionNote(held, step, moves.length),
  });
}

/** The prototype's target-spelling preference for emitted option symbols. */
const OPTION_FLAT_ROOTS: ReadonlySet<string> = new Set([
  "F", "Bb", "Eb", "Ab", "Db",
]);

function optionRootName(pitchClass: number): string {
  const flat = FLAT_NAMES[pc(pitchClass)] ?? "C";
  return OPTION_FLAT_ROOTS.has(flat) ? flat : (SHARP_NAMES[pc(pitchClass)] ?? "C");
}

type OptionSeed = Readonly<{
  semitones: number;
  quality: string;
  lowercase: boolean;
  suffix: string;
  why: string;
}>;

const DOMINANT_OPTIONS: readonly OptionSeed[] = Object.freeze([
  Object.freeze({
    semitones: 5, quality: "maj7", lowercase: false, suffix: "maj7",
    why: "Resolve down a fifth. The strongest landing there is.",
  }),
  Object.freeze({
    semitones: 5, quality: "m7", lowercase: true, suffix: "7",
    why: "Same resolution, but onto a minor tonic.",
  }),
  Object.freeze({
    semitones: 2, quality: "m7", lowercase: true, suffix: "7",
    why: "Deceptive: sidestep the tonic and keep moving.",
  }),
]);

const PREDOMINANT_OPTIONS: readonly OptionSeed[] = Object.freeze([
  Object.freeze({
    semitones: 5, quality: "7", lowercase: false, suffix: "7",
    why: "The V7 that completes the ii–V.",
  }),
  Object.freeze({
    semitones: 6, quality: "7", lowercase: false, suffix: "7",
    why: "Tritone sub for that V7 — the bass walks down a half step.",
  }),
  Object.freeze({
    semitones: 5, quality: "7b9", lowercase: false, suffix: "7",
    why: "Darker dominant. The ♭9 tightens the pull.",
  }),
]);

const TONIC_OPTIONS: readonly OptionSeed[] = Object.freeze([
  Object.freeze({
    semitones: 9, quality: "m7", lowercase: true, suffix: "7",
    why: "Begin a turnaround on the vi.",
  }),
  Object.freeze({
    semitones: 2, quality: "m7", lowercase: true, suffix: "7",
    why: "Step to ii and set up another ii–V.",
  }),
  Object.freeze({
    semitones: 9, quality: "7", lowercase: false, suffix: "7",
    why: "VI7 instead of vi — a secondary dominant turnaround.",
  }),
]);

const DEFAULT_OPTIONS: readonly OptionSeed[] = Object.freeze([
  Object.freeze({
    semitones: 5, quality: "maj7", lowercase: false, suffix: "maj7",
    why: "Up a fourth. The default gravity in this music.",
  }),
  Object.freeze({
    semitones: 2, quality: "m7", lowercase: true, suffix: "7",
    why: "Approach the next chord through its own ii.",
  }),
  Object.freeze({
    semitones: -1, quality: "7", lowercase: false, suffix: "7",
    why: "Chromatic dominant, leaning in from a half step above.",
  }),
]);

function optionTableFor(
  kind: ChartHarmonicKind | null,
  spec: ChordSpec,
): readonly OptionSeed[] {
  if (kind === "dominant") return DOMINANT_OPTIONS;
  if (kind === "predominant") return PREDOMINANT_OPTIONS;
  if (kind === "tonic") return TONIC_OPTIONS;
  if (kind === null) {
    /* Unkeyed: the tables are quality-driven, so pick by quality alone. */
    if (isDominantSpec(spec)) return DOMINANT_OPTIONS;
    if (isMinorSeventhSpec(spec) || isHalfDiminishedSpec(spec)) {
      return PREDOMINANT_OPTIONS;
    }
    if (isMajorTonicSpec(spec)) return TONIC_OPTIONS;
  }
  return DEFAULT_OPTIONS;
}

function nextOptionsFor(
  spec: ChordSpec,
  kind: ChartHarmonicKind | null,
  key: KeyContext | null,
): readonly ChartNextOption[] {
  const rootPc = pitchClassOf(spec.root);
  const table = optionTableFor(kind, spec).slice(0, MAX_CHART_NEXT_OPTIONS);
  const keyPc = key === null ? null : pitchClassOf(key.tonic);
  const kindLabel = kind ?? "unkeyed";
  return Object.freeze(
    table.map((seed) => {
      const targetPc = pc(rootPc + seed.semitones);
      const symbolText = `${optionRootName(targetPc)}${seed.quality}`;
      const roman =
        keyPc === null
          ? null
          : `${pcNumeral(pc(targetPc - keyPc), seed.lowercase)}${seed.suffix}`;
      return Object.freeze({
        id: `${kindLabel}:${symbolText}`,
        symbolText,
        roman,
        why: seed.why,
      });
    }),
  );
}

export function deriveChordDetail(
  request: DeriveChordDetailRequest,
  operations: ResolutionOperations,
): ChartChordDetail {
  const analysis = analyzeChartEvent(
    { current: request.current, key: request.key },
    operations,
  );
  const empty = (outcome: ChartChordDetail["outcome"]): ChartChordDetail =>
    Object.freeze({
      engineVersion: CHART_ANALYSIS_ENGINE_VERSION,
      outcome,
      analysis,
      tones: Object.freeze([]),
      guideToneNames: Object.freeze([]),
      resolution: null,
      next: Object.freeze([]),
    });

  const resolvedResult = operations.resolveChord(request.current);
  if (!resolvedResult.ok) return empty("resolution-refused");
  const resolved = resolvedResult.value;
  const realization = realizationOf(resolved);

  const tones: ChartToneView[] = [];
  realization.spelledPitchNames.forEach(
    (spelled: SpelledPitchClass, index: number) => {
      const pitchClass = realization.pitchClasses[index];
      if (pitchClass === undefined) return;
      const degree = realization.degrees?.[index] ?? null;
      tones.push(
        Object.freeze({
          name: displayName(spelled),
          spelled,
          pitchClass,
          role: degree === null ? null : roleLabel(degree),
          guide:
            degree !== null &&
            isGuideDegree(degree, realization.guideToneDegrees ?? []),
        }),
      );
    },
  );

  const guideToneNames = Object.freeze(
    tones.filter((tone) => tone.guide).map((tone) => tone.name),
  );

  let resolution: ChartChordDetail["resolution"] = null;
  if (request.next !== null && isParsed(request.next.spec)) {
    const nextResolved = operations.resolveChord(request.next.spec);
    if (nextResolved.ok) {
      resolution = deriveResolution(
        resolved,
        nextResolved.value,
        request.next.symbolText,
      );
    }
  }

  const next = isParsed(request.current)
    ? nextOptionsFor(request.current, analysis.kind, request.key)
    : Object.freeze([]);

  return Object.freeze({
    engineVersion: CHART_ANALYSIS_ENGINE_VERSION,
    outcome: analysis.outcome,
    analysis,
    tones: Object.freeze(tones.slice(0, 16)),
    guideToneNames,
    resolution,
    next,
  });
}
