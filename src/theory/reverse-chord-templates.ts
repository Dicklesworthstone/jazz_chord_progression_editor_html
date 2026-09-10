import type { AlteredDominantRealizationId, ChordFormulaRuleId } from "./resolution-contract";

/** Reviewed M0 reverse-T1 data, moved without changing values or order. */
export type ReverseChordTemplate = Readonly<{
  id: string;
  formulaRuleId: ChordFormulaRuleId;
  realizationId: AlteredDominantRealizationId | null;
  extensionNumber: 9 | null;
  pitchClassOffsets: readonly number[];
  omissibleFifth: boolean;
}>;

const template = (
  id: string,
  formulaRuleId: ChordFormulaRuleId,
  realizationId: AlteredDominantRealizationId | null,
  extensionNumber: 9 | null,
  pitchClassOffsets: readonly number[],
  omissibleFifth: boolean,
): ReverseChordTemplate =>
  Object.freeze({
    id,
    formulaRuleId,
    realizationId,
    extensionNumber,
    pitchClassOffsets: Object.freeze([...pitchClassOffsets]),
    omissibleFifth,
  });

/**
 * The frozen 24-entry template table, in ranking-tiebreak order. Every
 * formula rule id is drawn from the T1 CHORD_FORMULA_RULE_IDS vocabulary;
 * offsets are the pitch-class intervals of each family's frozen degree
 * set. "omissibleFifth" marks families whose perfect fifth (offset 7) may
 * be absent; structural fifths (b5/#5/dim) are never omissible.
 */
export const REVERSE_CHORD_TEMPLATES = Object.freeze([
  template("M0-TPL-01", "base-power", null, null, [0, 7], false),
  template("M0-TPL-02", "base-major", null, null, [0, 4, 7], false),
  template("M0-TPL-03", "base-minor", null, null, [0, 3, 7], false),
  template("M0-TPL-04", "base-diminished", null, null, [0, 3, 6], false),
  template("M0-TPL-05", "base-augmented", null, null, [0, 4, 8], false),
  template("M0-TPL-06", "base-sus2", null, null, [0, 2, 7], false),
  template("M0-TPL-07", "base-sus4", null, null, [0, 5, 7], false),
  template("M0-TPL-08", "sixth-major", null, null, [0, 4, 7, 9], true),
  template("M0-TPL-09", "sixth-minor", null, null, [0, 3, 7, 9], true),
  template("M0-TPL-10", "seventh-major", null, null, [0, 4, 7, 11], true),
  template("M0-TPL-11", "seventh-dominant", null, null, [0, 4, 7, 10], true),
  template("M0-TPL-12", "seventh-minor", null, null, [0, 3, 7, 10], true),
  template("M0-TPL-13", "seventh-minor-major", null, null, [0, 3, 7, 11], true),
  template(
    "M0-TPL-14",
    "seventh-half-diminished",
    null,
    null,
    [0, 3, 6, 10],
    false,
  ),
  template("M0-TPL-15", "seventh-diminished", null, null, [0, 3, 6, 9], false),
  template(
    "M0-TPL-16",
    "seventh-augmented-major",
    null,
    null,
    [0, 4, 8, 11],
    false,
  ),
  template(
    "M0-TPL-17",
    "extension-suspended-dominant",
    null,
    null,
    [0, 5, 7, 10],
    true,
  ),
  template("M0-TPL-18", "extension-major", null, 9, [0, 2, 4, 7, 11], true),
  template("M0-TPL-19", "extension-dominant", null, 9, [0, 2, 4, 7, 10], true),
  template("M0-TPL-20", "extension-minor", null, 9, [0, 2, 3, 7, 10], true),
  template(
    "M0-TPL-21",
    "altered-dominant",
    "alt-b9-b5",
    null,
    [0, 1, 4, 6, 10],
    false,
  ),
  template(
    "M0-TPL-22",
    "altered-dominant",
    "alt-b9-sharp5",
    null,
    [0, 1, 4, 8, 10],
    false,
  ),
  template(
    "M0-TPL-23",
    "altered-dominant",
    "alt-sharp9-b5",
    null,
    [0, 3, 4, 6, 10],
    false,
  ),
  template(
    "M0-TPL-24",
    "altered-dominant",
    "alt-sharp9-sharp5",
    null,
    [0, 3, 4, 8, 10],
    false,
  ),
] as const);

