import type { ChordDegree, ProgressionDocumentV2, SpelledPitchClass } from "../domain";
import {
  H0_ANALYSIS_RULE_TABLE_ID,
  H0_ANALYSIS_RULE_TABLE_VERSION,
  H0_CHORD_SCALE_MAPPING_TABLE_ID,
  H0_CHORD_SCALE_MAPPING_TABLE_VERSION,
  enumerateChordScaleOptions,
  resolveChord,
  type H0ChordScaleFamily,
  type H0ChordScaleOption,
} from "../theory";

/**
 * Plural chord-scale options for one chart chord through H0's
 * `enumerateChordScaleOptions`. The request carries the chord's own section
 * key (or the chart key) as a tonal frame, and no caller declaration; H0
 * decides each option's tier. For a 7alt chord the first T1 realization is
 * the selection, the same reading the chord-detail tones show: the app
 * selects, H0 never chooses among the four.
 */

export type ChartScaleOptionView = Readonly<{
  id: string;
  /** "D Dorian" */
  name: string;
  strength: "exact" | "strong" | "plausible" | "speculative";
  /** "D E F G A B C" */
  notes: string;
  /** "9, 11, 13" or null when none is listed as available. */
  tensions: string | null;
  /** A visible minor-ninth clash, e.g. "11 (F) sits a minor ninth above the 3 (E)". */
  clashes: readonly string[];
  /** Why a plausible option is not exact; null for exact options. */
  caveat: string | null;
}>;

export type ChartScaleOptionsView = Readonly<{
  options: readonly ChartScaleOptionView[];
  /** True when several families fit equally well and none is preferred. */
  plural: boolean;
}>;

const FAMILY_NAMES: Readonly<Record<H0ChordScaleFamily, string>> = Object.freeze({
  ionian: "Ionian (major)",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  "lydian-dominant": "Lydian dominant",
  altered: "Altered",
  "whole-tone": "Whole-tone",
  "half-whole-diminished": "Half–whole diminished",
  "whole-half-diminished": "Whole–half diminished",
  dorian: "Dorian",
  "melodic-minor": "Melodic minor",
  locrian: "Locrian",
  "locrian-natural-2": "Locrian ♮2",
});

const glyphs = (alter: number): string =>
  alter === -2 ? "𝄫" : alter === 2 ? "𝄪" : alter < 0 ? "♭".repeat(-alter) : "♯".repeat(alter);

/** What a player can do about each kind of missing evidence H0 names. */
const CAVEATS: Readonly<Record<string, string>> = Object.freeze({
  "key-absent": "Set the chart's key to tell these apart.",
  "declared-context-insufficient": "The chord fits this scale; whether the passage is in this mode depends on context the chart does not state.",
});
const pitchName = (pitch: SpelledPitchClass): string => `${pitch.step}${glyphs(pitch.alter)}`;
const degreeName = (degree: ChordDegree): string => `${glyphs(degree.alter)}${String(degree.number)}`;

function optionView(option: H0ChordScaleOption, root: SpelledPitchClass): ChartScaleOptionView {
  const family = option.mappingRuleId === "h0.scale.suspended-dominant"
    ? "Mixolydian (suspended)" : FAMILY_NAMES[option.family];
  const available = option.tensions.filter((tension) => tension.availability === "available");
  return Object.freeze({
    id: option.optionId,
    name: `${pitchName(root)} ${family}`,
    strength: option.strength,
    notes: option.spelledPitchNames.map(pitchName).join(" "),
    tensions: available.length === 0 ? null : available.map((tension) => degreeName(tension.degree)).join(", "),
    clashes: Object.freeze(option.minorNinthClashes.map((clash) =>
      `${degreeName(clash.tensionDegree)} (${pitchName(clash.tensionSpelling)}) sits a minor ninth above the ${
        degreeName(clash.chordToneDegree)} (${pitchName(clash.chordToneSpelling)})`)),
    caveat: option.missingEvidence.length === 0 ? null
      : [...new Set(option.missingEvidence.map((missing) => CAVEATS[missing.code] ?? missing.detail))].join(" "),
  });
}

export function chartScaleOptions(
  document: ProgressionDocumentV2,
  eventId: string,
): ChartScaleOptionsView | null {
  for (const section of document.sections) {
    for (const measure of section.measures) {
      for (const event of measure.events) {
        if (event.id !== eventId) continue;
        if (event.chord.kind !== "parsed") return null;
        const resolved = resolveChord(event.chord);
        if (!resolved.ok) return null;
        const key = section.keyOverride ?? document.key;
        const result = enumerateChordScaleOptions({
          requestId: "chart-scales", baseRevision: 0, key, declaredSpan: key === null ? "unspecified" : "tonal",
          previous: null, next: null,
          current: { eventId: event.id, resolved: resolved.value, selectedRealizationId: resolved.value.realizations[0].id },
          analysisRuleTable: { id: H0_ANALYSIS_RULE_TABLE_ID, version: H0_ANALYSIS_RULE_TABLE_VERSION },
          chordScaleMappingTable: { id: H0_CHORD_SCALE_MAPPING_TABLE_ID, version: H0_CHORD_SCALE_MAPPING_TABLE_VERSION },
          declaredScaleContext: null,
        });
        if (!result.ok || result.value.disposition === "not-applicable" || result.value.disposition === "unclassified") {
          return null;
        }
        const root = event.chord.root;
        return Object.freeze({
          options: Object.freeze(result.value.options.map((option) => optionView(option, root))),
          plural: result.value.disposition === "ambiguous",
        });
      }
    }
  }
  return null;
}
