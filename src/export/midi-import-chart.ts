import type { ChordDegree, ChordSpec, SpelledPitchClass } from "../domain";
import { formatChordSymbol } from "../theory";
import { meterSegmentsOf, type MidiImportMeterSegment } from "./midi-import";
import {
  MIDI_IMPORT_CANONICAL_SPELLINGS,
  type MidiImportChordAlternative,
  type MidiImportResolutionOutcome,
  type MidiImportSonority,
  type MidiImportValue,
} from "./midi-import-contract";

/**
 * M0 chart derivation: from resolved sonorities to Quick Entry chart text.
 *
 * The frozen M0 spec deliberately deferred two decisions to this build phase.
 * Both are settled here, in one place, and both are stated to the caller
 * rather than applied behind their back:
 *
 * **Symbol text.** Every chord symbol is rendered by the real T0 formatter
 * from a `ChordSpec` built out of the template's T1 formula rule. Nothing here
 * concatenates symbol characters, so the import cannot fork the grammar; a
 * template the formatter refuses simply yields no text.
 *
 * **durationLaw.** Each sonority belongs to the bar its `measureIndex` names.
 * Within a bar, chords sound from one quantized onset to the next, and the
 * last runs to the bar line — anchor to next anchor inside the measure map,
 * with the bar's first chord starting the bar. Two consequences are recorded,
 * not hidden: a bar whose chords divide it evenly is written WITHOUT explicit
 * durations, so it fits whatever meter the destination chart carries; a bar
 * whose chords do not divide it evenly carries exact rational beat durations
 * measured in the IMPORTED file's meter, so importing it into a chart in a
 * different meter refuses honestly rather than being silently rebalanced.
 *
 * A sonority whose reverse-T1 outcome is Custom has no name in the T0 chord
 * grammar. It is never given an invented one: it contributes no chord, its
 * literal pitch classes travel to the preview, and the chord before it sounds
 * across it. A bar with no nameable chord at all is written empty.
 */

const ACCIDENTAL_STYLE = "ascii" as const;

/** Default name for the section one import creates. */
export const MIDI_IMPORT_SECTION_NAME = "MIDI import";

export type MidiImportChartSonority = Readonly<{
  /** Index into the decode result's parallel sonority and resolution arrays. */
  index: number;
  sonority: MidiImportSonority;
  outcome: MidiImportResolutionOutcome;
  /** The highest-ranked alternative the T0 formatter could render, if any. */
  symbolText: string | null;
  /** Every ranked alternative rendered for the preview, best first. */
  alternativeTexts: readonly string[];
  /** Literal canonical pitch names when the outcome is the Custom fallback. */
  customPitchNames: readonly string[];
  /** True when this sonority contributed a chord to the emitted chart text. */
  written: boolean;
}>;

export type MidiImportChartPlan = Readonly<{
  sectionName: string;
  /** Quick Entry fragment text: one named section of barred measures. */
  chartText: string;
  measureCount: number;
  writtenChordCount: number;
  unnamedSonorityCount: number;
  emptyMeasureCount: number;
  /** True when at least one bar needed the imported file's own beat units. */
  usesExplicitDurations: boolean;
  codePointCount: number;
  sonorities: readonly MidiImportChartSonority[];
}>;

/* ------------------------------------------------------------------ *
 * Symbol text through the T0 formatter                                *
 * ------------------------------------------------------------------ */

function degree(number: 5 | 9, alter: -1 | 0 | 1): ChordDegree {
  return Object.freeze({ number, alter });
}

type SpecShape = Readonly<{
  triad: ChordSpec["triad"];
  seventh: ChordSpec["seventh"];
  sixth: boolean;
  extensions: readonly ChordDegree[];
  alterations: readonly ChordDegree[];
}>;

/**
 * Template identity to chord structure. Each row restates the same degree set
 * the template's pitch-class fingerprint encodes, expressed in the domain's
 * chord vocabulary so the T0 formatter can render it.
 */
function specShapeFor(
  alternative: MidiImportChordAlternative,
): SpecShape | null {
  switch (alternative.formulaRuleId) {
    case "base-major":
      return { triad: "major", seventh: null, sixth: false, extensions: [], alterations: [] };
    case "base-minor":
      return { triad: "minor", seventh: null, sixth: false, extensions: [], alterations: [] };
    case "base-diminished":
      return { triad: "diminished", seventh: null, sixth: false, extensions: [], alterations: [] };
    case "base-augmented":
      return { triad: "augmented", seventh: null, sixth: false, extensions: [], alterations: [] };
    case "base-sus2":
      return { triad: "sus2", seventh: null, sixth: false, extensions: [], alterations: [] };
    case "base-sus4":
      return { triad: "sus4", seventh: null, sixth: false, extensions: [], alterations: [] };
    case "base-power":
      return { triad: "power", seventh: null, sixth: false, extensions: [], alterations: [] };
    case "sixth-major":
      return { triad: "major", seventh: null, sixth: true, extensions: [], alterations: [] };
    case "sixth-minor":
      return { triad: "minor", seventh: null, sixth: true, extensions: [], alterations: [] };
    case "seventh-major":
      return { triad: "major", seventh: "major", sixth: false, extensions: [], alterations: [] };
    case "seventh-dominant":
      return { triad: "major", seventh: "minor", sixth: false, extensions: [], alterations: [] };
    case "seventh-minor":
      return { triad: "minor", seventh: "minor", sixth: false, extensions: [], alterations: [] };
    case "seventh-minor-major":
      return { triad: "minor", seventh: "major", sixth: false, extensions: [], alterations: [] };
    case "seventh-half-diminished":
      return { triad: "diminished", seventh: "minor", sixth: false, extensions: [], alterations: [] };
    case "seventh-diminished":
      return { triad: "diminished", seventh: "diminished", sixth: false, extensions: [], alterations: [] };
    case "seventh-augmented-major":
      return {
        triad: "major",
        seventh: "major",
        sixth: false,
        extensions: [],
        alterations: [degree(5, 1)],
      };
    case "extension-suspended-dominant":
      return { triad: "sus4", seventh: "minor", sixth: false, extensions: [], alterations: [] };
    case "extension-major":
      return {
        triad: "major",
        seventh: "major",
        sixth: false,
        extensions: [degree(9, 0)],
        alterations: [],
      };
    case "extension-dominant":
      return {
        triad: "major",
        seventh: "minor",
        sixth: false,
        extensions: [degree(9, 0)],
        alterations: [],
      };
    case "extension-minor":
      return {
        triad: "minor",
        seventh: "minor",
        sixth: false,
        extensions: [degree(9, 0)],
        alterations: [],
      };
    case "altered-dominant": {
      const ninth =
        alternative.realizationId === "alt-b9-b5" ||
        alternative.realizationId === "alt-b9-sharp5"
          ? degree(9, -1)
          : degree(9, 1);
      const fifth =
        alternative.realizationId === "alt-b9-b5" ||
        alternative.realizationId === "alt-sharp9-b5"
          ? degree(5, -1)
          : degree(5, 1);
      return {
        triad: "major",
        seventh: "minor",
        sixth: false,
        /* Degree arrays are number-then-alter ordered: the fifth precedes the ninth. */
        extensions: [],
        alterations: [fifth, ninth],
        };
    }
    case "custom":
    default:
      /* The T1 custom rule has no fixed degree set to render. */
      return null;
  }
}

/**
 * Renders one ranked alternative as canonical T0 symbol text, or null when the
 * grammar cannot express it. The text is produced by the real T0 formatter, so
 * whatever it returns round-trips through the real T0 parser.
 */
export function symbolTextForAlternative(
  alternative: MidiImportChordAlternative,
  spellingOverrides?: Readonly<{
    root?: SpelledPitchClass;
    bass?: SpelledPitchClass;
  }>,
): string | null {
  const shape = specShapeFor(alternative);
  if (shape === null) return null;
  const spec: ChordSpec = Object.freeze({
    kind: "parsed" as const,
    sourceText: "",
    root: spellingOverrides?.root ?? alternative.rootSpelled,
    triad: shape.triad,
    sixth: shape.sixth ? Object.freeze({ number: 6 as const, alter: 0 as const }) : null,
    seventh: shape.seventh,
    extensions: Object.freeze([...shape.extensions]),
    additions: Object.freeze([]),
    alterations: Object.freeze([...shape.alterations]),
    omissions: Object.freeze(
      alternative.matchKind === "omitted-fifth" ? ([5] as const) : ([] as const),
    ),
    bass:
      alternative.inversion === "slash"
        ? (spellingOverrides?.bass ??
          canonicalSpellingOf(alternative.bassPitchClass))
        : null,
    colorPolicy: "none" as const,
  });
  const formatted = formatChordSymbol(spec, ACCIDENTAL_STYLE);
  return formatted.ok ? formatted.canonicalText : null;
}

function canonicalSpellingOf(pitchClass: number): SpelledPitchClass {
  return (
    MIDI_IMPORT_CANONICAL_SPELLINGS[pitchClass] ?? { step: "C", alter: 0 }
  );
}

/** Display text for one spelled pitch class. Never a chord symbol. */
export function pitchClassText(spelled: SpelledPitchClass): string {
  const accidental =
    spelled.alter === 0
      ? ""
      : spelled.alter < 0
        ? "b".repeat(-spelled.alter)
        : "#".repeat(spelled.alter);
  return `${spelled.step}${accidental}`;
}

/* ------------------------------------------------------------------ *
 * durationLaw                                                         *
 * ------------------------------------------------------------------ */

/** Unicode scalar count: what the Quick Entry cap actually measures. */
export function countCodePoints(text: string): number {
  let count = 0;
  const scalars = text[Symbol.iterator]();
  while (!scalars.next().done) count += 1;
  return count;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === 0 ? 1 : a;
}

export function durationText(numerator: number, denominator: number): string {
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return reducedDenominator === 1
    ? `:${String(reducedNumerator)}`
    : `:${String(reducedNumerator)}/${String(reducedDenominator)}`;
}

/** Escapes a section name for the T0 section marker. */
export function escapeSectionName(name: string): string {
  return name.replace(/\\/gu, "\\\\").replace(/\]/gu, "\\]");
}

type BarEntry = Readonly<{
  chartIndex: number;
  /** Quantized onset in units of 1/beatUnit ticks, measured from tick zero. */
  onsetScaled: number;
  symbolText: string;
}>;

function segmentFor(
  segments: readonly MidiImportMeterSegment[],
  sonority: MidiImportSonority,
): MidiImportMeterSegment {
  return (
    segments[sonority.segmentIndex] ?? {
      startTick: 0,
      numerator: 4,
      beatUnit: 4,
      baseMeasureIndex: 0,
    }
  );
}

/**
 * Derives a Quick Entry fragment from a decoded import. Returns null when the
 * file yielded no sonority the T0 grammar can name — the honest outcome for a
 * drum track or a cluster study, and the caller states it rather than writing
 * an empty chart.
 */
type MutableChartSonority = {
  index: number;
  sonority: MidiImportSonority;
  outcome: MidiImportResolutionOutcome;
  symbolText: string | null;
  alternativeTexts: readonly string[];
  customPitchNames: readonly string[];
  written: boolean;
};

function describeSonorities(value: MidiImportValue): MutableChartSonority[] {
  const rows: MutableChartSonority[] = [];
  for (let index = 0; index < value.sonorities.length; index += 1) {
    const sonority = value.sonorities[index];
    const outcome = value.resolutions[index];
    if (sonority === undefined || outcome === undefined) continue;
    const alternativeTexts: string[] = [];
    if (outcome.kind === "alternatives") {
      for (const alternative of outcome.alternatives) {
        const text = symbolTextForAlternative(alternative);
        if (text !== null) alternativeTexts.push(text);
      }
    }
    rows.push({
      index,
      sonority,
      outcome,
      symbolText: alternativeTexts[0] ?? null,
      alternativeTexts: Object.freeze([...alternativeTexts]),
      customPitchNames: Object.freeze(
        outcome.kind === "custom"
          ? outcome.spelledPitchClasses.map(pitchClassText)
          : [],
      ),
      written: false,
    });
  }
  return rows;
}

/**
 * Every decoded sonority described for a reader, whether or not a chart can be
 * derived from it. A file whose every sonority falls back to Custom writes no
 * chart at all, and the reader must still see exactly which pitches were
 * found — "nothing to write" without the literal pitch set is not honesty, it
 * is a shrug.
 */
export function describeMidiImportSonorities(
  value: MidiImportValue,
): readonly MidiImportChartSonority[] {
  return Object.freeze(
    describeSonorities(value).map((entry) => Object.freeze({ ...entry })),
  );
}

export function planMidiImportChart(
  value: MidiImportValue,
  sectionName: string = MIDI_IMPORT_SECTION_NAME,
): MidiImportChartPlan | null {
  const ppq = value.model.header.division;
  const segments = meterSegmentsOf(value.model);

  const chartSonorities = describeSonorities(value);
  const written = chartSonorities.filter((entry) => entry.symbolText !== null);
  if (written.length === 0) return null;

  const firstMeasure = written[0]?.sonority.measureIndex ?? 0;
  let lastMeasure = firstMeasure;
  for (const entry of written) {
    if (entry.sonority.measureIndex > lastMeasure) {
      lastMeasure = entry.sonority.measureIndex;
    }
  }

  const bars = new Map<number, BarEntry[]>();
  for (const entry of written) {
    const symbolText = entry.symbolText;
    if (symbolText === null) continue;
    const list = bars.get(entry.sonority.measureIndex) ?? [];
    list.push({
      chartIndex: entry.index,
      onsetScaled: entry.sonority.quantizedTickNumerator,
      symbolText,
    });
    bars.set(entry.sonority.measureIndex, list);
  }

  const measureTexts: string[] = [];
  let usesExplicitDurations = false;
  let emptyMeasureCount = 0;
  let writtenChordCount = 0;

  for (
    let measureIndex = firstMeasure;
    measureIndex <= lastMeasure;
    measureIndex += 1
  ) {
    const entries = bars.get(measureIndex);
    if (entries === undefined || entries.length === 0) {
      measureTexts.push("");
      emptyMeasureCount += 1;
      continue;
    }
    entries.sort((left, right) => left.onsetScaled - right.onsetScaled);
    const anchor = chartSonorities.find(
      (candidate) => candidate.index === entries[0]?.chartIndex,
    );
    const segment =
      anchor === undefined
        ? segments[0]
        : segmentFor(segments, anchor.sonority);
    const beatUnit = segment?.beatUnit ?? 4;
    const numerator = segment?.numerator ?? 4;
    const segmentStart = segment?.startTick ?? 0;
    const baseMeasureIndex = segment?.baseMeasureIndex ?? 0;
    /* All of the following are exact integers in units of 1/beatUnit ticks. */
    const measureScaled = numerator * ppq * 4;
    const barStartScaled =
      segmentStart * beatUnit +
      (measureIndex - baseMeasureIndex) * measureScaled;
    const beatScaled = ppq * 4;

    const offsets = entries.map((entry) =>
      Math.max(0, entry.onsetScaled - barStartScaled),
    );
    /* The bar's first chord sounds from the bar line. */
    if (offsets.length > 0) offsets[0] = 0;

    const count = offsets.length;
    let dividesEvenly = true;
    for (let position = 0; position < count; position += 1) {
      if ((offsets[position] ?? 0) * count !== position * measureScaled) {
        dividesEvenly = false;
        break;
      }
    }

    const tokens: string[] = [];
    for (let position = 0; position < count; position += 1) {
      const entry = entries[position];
      if (entry === undefined) continue;
      writtenChordCount += 1;
      const marked = chartSonorities.find(
        (candidate) => candidate.index === entry.chartIndex,
      );
      if (marked !== undefined) marked.written = true;
      if (dividesEvenly) {
        tokens.push(entry.symbolText);
        continue;
      }
      usesExplicitDurations = true;
      const start = offsets[position] ?? 0;
      const end = position + 1 < count ? (offsets[position + 1] ?? 0) : measureScaled;
      tokens.push(`${entry.symbolText}${durationText(end - start, beatScaled)}`);
    }
    measureTexts.push(tokens.join(" "));
  }

  const body = `|${measureTexts
    .map((text) => (text.length === 0 ? "" : ` ${text}`))
    .join(" |")} |`;
  const chartText = `[${escapeSectionName(sectionName)}]\n${body}\n`;

  const frozenSonorities = Object.freeze(
    chartSonorities.map((entry) => Object.freeze({ ...entry })),
  );
  return Object.freeze({
    sectionName,
    chartText,
    measureCount: measureTexts.length,
    writtenChordCount,
    unnamedSonorityCount: frozenSonorities.filter((entry) => !entry.written)
      .length,
    emptyMeasureCount,
    usesExplicitDurations,
    codePointCount: countCodePoints(chartText),
    sonorities: frozenSonorities,
  });
}
