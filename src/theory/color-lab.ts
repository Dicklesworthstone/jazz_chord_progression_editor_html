import {
  type ChordDegree,
  type ChordEventId,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type ColorLabResult,
  type ContextualColorOption,
  type UpperStructureTriadOption,
  G6_COLOR_LAB_RESULT_SCHEMA,
} from "./color-lab-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";

function parseDegreeString(str: string): ChordDegree {
  let alter: 0 | 1 | -1 | 2 | -2 = 0;
  let numStr = str;
  if (str.startsWith("bb")) {
    alter = -2;
    numStr = str.slice(2);
  } else if (str.startsWith("b")) {
    alter = -1;
    numStr = str.slice(1);
  } else if (str.startsWith("##")) {
    alter = 2;
    numStr = str.slice(2);
  } else if (str.startsWith("#")) {
    alter = 1;
    numStr = str.slice(1);
  }
  const num = parseInt(numStr, 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9 | 11 | 13;
  return { number: num, alter };
}

/**
 * Derive contextual tension sets, chord-scale color packages, and upper-structure triads.
 */
export function deriveContextualColor(
  chordSymbol: string,
  eventId: ChordEventId,
  _keyContext?: KeyContext,
  accidentalStyle: AccidentalStyle = "ascii",
): ColorLabResult {
  const parsed = parseChordSymbol(chordSymbol, accidentalStyle);
  if (!parsed.ok) {
    return {
      ok: false,
      refusal: {
        code: "g6.invalid_chord",
        message: `Invalid chord symbol: ${chordSymbol}`,
      },
    };
  }

  const chord = parsed.chord;
  const root = chord.root;
  const triad = chord.triad;
  const seventh = chord.seventh;
  const rootStr = spelledPitchClassToString(root);

  const colorOptions: ContextualColorOption[] = [];
  const upperStructureOptions: UpperStructureTriadOption[] = [];

  const isDominant =
    (triad === "major" || triad === "sus4" || triad === "sus2") && seventh === "minor";
  const isMajor = triad === "major" && (seventh === "major" || seventh === null);
  const isMinor = triad === "minor" && (seventh === "minor" || seventh === null);

  if (isDominant) {
    // 1. Mixolydian (Natural 9, 13)
    colorOptions.push({
      optionId: `${rootStr}7_MIXOLYDIAN`,
      family: "diatonic-extension",
      title: "Natural 9, 13 (Mixolydian)",
      tensions: ["9", "13"],
      resultingDegrees: ["1", "3", "5", "b7", "9", "13"].map(parseDegreeString),
      omittedDegrees: [],
      spelledPitches: [
        root,
        transposeSpelledPitchClass(root, 2, 4),
        transposeSpelledPitchClass(root, 4, 7),
        transposeSpelledPitchClass(root, 6, 10),
        transposeSpelledPitchClass(root, 1, 2),
        transposeSpelledPitchClass(root, 5, 9),
      ],
      compatibleScaleId: "scale.mixolydian",
      compatibleScaleName: "Mixolydian",
      guideTonesRetained: true,
      clashes: [],
      cautions: ["Avoid natural 11 as a sustained harmonic tension against major 3rd."],
      suggestedSymbol: `${rootStr}13`,
      description: "Standard acoustic dominant color with natural 9 and 13.",
    });

    // 2. Lydian Dominant (9, #11, 13)
    colorOptions.push({
      optionId: `${rootStr}7_LYDIAN_DOMINANT`,
      family: "lydian-dominant",
      title: "Bright #11, 9, 13 (Lydian Dominant)",
      tensions: ["9", "#11", "13"],
      resultingDegrees: ["1", "3", "5", "b7", "9", "#11", "13"].map(parseDegreeString),
      omittedDegrees: [],
      spelledPitches: [
        root,
        transposeSpelledPitchClass(root, 2, 4),
        transposeSpelledPitchClass(root, 4, 7),
        transposeSpelledPitchClass(root, 6, 10),
        transposeSpelledPitchClass(root, 1, 2),
        transposeSpelledPitchClass(root, 3, 6),
        transposeSpelledPitchClass(root, 5, 9),
      ],
      compatibleScaleId: "scale.lydian-dominant",
      compatibleScaleName: "Lydian Dominant",
      guideTonesRetained: true,
      clashes: [],
      cautions: [],
      suggestedSymbol: `${rootStr}13(#11)`,
      description: "Bright overtone / acoustic scale with raised 4th (#11) eliminating avoid-note clashes.",
    });

    // 3. Altered Dominant (b9, #9, #11, b13)
    colorOptions.push({
      optionId: `${rootStr}7_ALTERED`,
      family: "altered-dominant",
      title: "Full Altered (b9, #9, #11, b13)",
      tensions: ["b9", "#9", "#11", "b13"],
      resultingDegrees: ["1", "3", "b7", "b9", "#9", "#11", "b13"].map(parseDegreeString),
      omittedDegrees: ["5"].map(parseDegreeString),
      spelledPitches: [
        root,
        transposeSpelledPitchClass(root, 2, 4),
        transposeSpelledPitchClass(root, 6, 10),
        transposeSpelledPitchClass(root, 1, 1),
        transposeSpelledPitchClass(root, 1, 3),
        transposeSpelledPitchClass(root, 3, 6),
        transposeSpelledPitchClass(root, 5, 8),
      ],
      compatibleScaleId: "scale.altered",
      compatibleScaleName: "Altered (Super Locrian)",
      guideTonesRetained: true,
      clashes: [],
      cautions: ["Omit natural 5th to prevent clash with #11/b13."],
      suggestedSymbol: `${rootStr}7alt`,
      description: "Maximum tension dominant resolution for minor or major targets.",
    });

    // Upper Structure Triads
    const ustII_Root = transposeSpelledPitchClass(root, 1, 2);
    const ustII_Str = spelledPitchClassToString(ustII_Root);
    upperStructureOptions.push({
      ustId: `UST_D_OVER_${rootStr}7`,
      triadRoot: ustII_Root,
      triadQuality: "major",
      numeralRelation: "II",
      resultingTensions: ["9", "#11", "13"],
      resultingDegrees: ["9", "#11", "13"].map(parseDegreeString),
      omittedDegrees: ["1", "5"].map(parseDegreeString),
      bassRelation: "Root in bass, major triad on 2nd degree above.",
      compatibleScaleId: "scale.lydian-dominant",
      symbolNotation: `${ustII_Str}/${rootStr}7`,
      triadPitches: [
        ustII_Root,
        transposeSpelledPitchClass(ustII_Root, 2, 4),
        transposeSpelledPitchClass(ustII_Root, 4, 7),
      ],
      guideTonesRetained: false,
      clashes: [],
      description: "Major triad on whole step above dominant root gives 9, #11, 13.",
    });

    const ustbVI_Root = transposeSpelledPitchClass(root, 5, 8);
    const ustbVI_Str = spelledPitchClassToString(ustbVI_Root);
    upperStructureOptions.push({
      ustId: `UST_Ab_OVER_${rootStr}7`,
      triadRoot: ustbVI_Root,
      triadQuality: "major",
      numeralRelation: "bVI",
      resultingTensions: ["b13", "#9"],
      resultingDegrees: ["b13", "1", "#9"].map(parseDegreeString),
      omittedDegrees: ["5"].map(parseDegreeString),
      bassRelation: "Root in bass, major triad on b6th degree above.",
      compatibleScaleId: "scale.altered",
      symbolNotation: `${ustbVI_Str}/${rootStr}7`,
      triadPitches: [
        ustbVI_Root,
        transposeSpelledPitchClass(ustbVI_Root, 2, 4),
        transposeSpelledPitchClass(ustbVI_Root, 4, 7),
      ],
      guideTonesRetained: false,
      clashes: [],
      description: "Major triad on flat-6th above root gives b13, root, #9 (Altered tension).",
    });

    const ustVI_Root = transposeSpelledPitchClass(root, 5, 9);
    const ustVI_Str = spelledPitchClassToString(ustVI_Root);
    upperStructureOptions.push({
      ustId: `UST_A_OVER_${rootStr}7`,
      triadRoot: ustVI_Root,
      triadQuality: "major",
      numeralRelation: "VI",
      resultingTensions: ["13", "b9"],
      resultingDegrees: ["13", "b9", "3"].map(parseDegreeString),
      omittedDegrees: ["5"].map(parseDegreeString),
      bassRelation: "Root in bass, major triad on 6th degree above.",
      compatibleScaleId: "scale.diminished-half-whole",
      symbolNotation: `${ustVI_Str}/${rootStr}7`,
      triadPitches: [
        ustVI_Root,
        transposeSpelledPitchClass(ustVI_Root, 2, 4),
        transposeSpelledPitchClass(ustVI_Root, 4, 7),
      ],
      guideTonesRetained: false,
      clashes: [],
      description: "Major triad on 6th degree above root gives 13, b9, 3 (Half-Whole Diminished color).",
    });

    const ustbV_Root = transposeSpelledPitchClass(root, 4, 6);
    const ustbV_Str = spelledPitchClassToString(ustbV_Root);
    upperStructureOptions.push({
      ustId: `UST_Gb_OVER_${rootStr}7`,
      triadRoot: ustbV_Root,
      triadQuality: "major",
      numeralRelation: "bV",
      resultingTensions: ["#11", "b9"],
      resultingDegrees: ["#11", "b7", "b9"].map(parseDegreeString),
      omittedDegrees: ["1", "5"].map(parseDegreeString),
      bassRelation: "Root in bass, major triad on b5th degree above.",
      compatibleScaleId: "scale.altered",
      symbolNotation: `${ustbV_Str}/${rootStr}7`,
      triadPitches: [
        ustbV_Root,
        transposeSpelledPitchClass(ustbV_Root, 2, 4),
        transposeSpelledPitchClass(ustbV_Root, 4, 7),
      ],
      guideTonesRetained: false,
      clashes: [],
      description: "Major triad on tritone above root gives #11, b7, b9.",
    });

    const ustbIII_Root = transposeSpelledPitchClass(root, 2, 3);
    const ustbIII_Str = spelledPitchClassToString(ustbIII_Root);
    upperStructureOptions.push({
      ustId: `UST_Eb_OVER_${rootStr}7`,
      triadRoot: ustbIII_Root,
      triadQuality: "major",
      numeralRelation: "bIII",
      resultingTensions: ["#9"],
      resultingDegrees: ["#9", "5", "b7"].map(parseDegreeString),
      omittedDegrees: ["1"].map(parseDegreeString),
      bassRelation: "Root in bass, major triad on b3rd degree above.",
      compatibleScaleId: "scale.altered",
      symbolNotation: `${ustbIII_Str}/${rootStr}7`,
      triadPitches: [
        ustbIII_Root,
        transposeSpelledPitchClass(ustbIII_Root, 2, 4),
        transposeSpelledPitchClass(ustbIII_Root, 4, 7),
      ],
      guideTonesRetained: false,
      clashes: [],
      description: "Major triad on minor 3rd above root gives #9, 5, b7 (Hendrix / blues tension).",
    });
  } else if (isMajor) {
    // Ionian
    colorOptions.push({
      optionId: `${rootStr}MAJ7_IONIAN`,
      family: "diatonic-extension",
      title: "Natural 9, 13 (Ionian / Major)",
      tensions: ["9", "13"],
      resultingDegrees: ["1", "3", "5", "7", "9", "13"].map(parseDegreeString),
      omittedDegrees: [],
      spelledPitches: [
        root,
        transposeSpelledPitchClass(root, 2, 4),
        transposeSpelledPitchClass(root, 4, 7),
        transposeSpelledPitchClass(root, 6, 11),
        transposeSpelledPitchClass(root, 1, 2),
        transposeSpelledPitchClass(root, 5, 9),
      ],
      compatibleScaleId: "scale.ionian",
      compatibleScaleName: "Ionian",
      guideTonesRetained: true,
      clashes: [],
      cautions: ["Natural 11 is an avoid note against major 3rd."],
      suggestedSymbol: `${rootStr}maj9`,
      description: "Standard major tonic color with natural 9 and 13.",
    });

    // Lydian
    colorOptions.push({
      optionId: `${rootStr}MAJ7_LYDIAN`,
      family: "modal-color",
      title: "Acoustic #11, 9, 13 (Lydian)",
      tensions: ["9", "#11", "13"],
      resultingDegrees: ["1", "3", "5", "7", "9", "#11", "13"].map(parseDegreeString),
      omittedDegrees: [],
      spelledPitches: [
        root,
        transposeSpelledPitchClass(root, 2, 4),
        transposeSpelledPitchClass(root, 4, 7),
        transposeSpelledPitchClass(root, 6, 11),
        transposeSpelledPitchClass(root, 1, 2),
        transposeSpelledPitchClass(root, 3, 6),
        transposeSpelledPitchClass(root, 5, 9),
      ],
      compatibleScaleId: "scale.lydian",
      compatibleScaleName: "Lydian",
      guideTonesRetained: true,
      clashes: [],
      cautions: [],
      suggestedSymbol: `${rootStr}maj7(#11)`,
      description: "Lydian tonic color with raised 4th (#11).",
    });
  } else if (isMinor) {
    // Dorian
    colorOptions.push({
      optionId: `${rootStr}M7_DORIAN`,
      family: "modal-color",
      title: "Standard 9, 11, 13 (Dorian)",
      tensions: ["9", "11", "13"],
      resultingDegrees: ["1", "b3", "5", "b7", "9", "11", "13"].map(parseDegreeString),
      omittedDegrees: [],
      spelledPitches: [
        root,
        transposeSpelledPitchClass(root, 2, 3),
        transposeSpelledPitchClass(root, 4, 7),
        transposeSpelledPitchClass(root, 6, 10),
        transposeSpelledPitchClass(root, 1, 2),
        transposeSpelledPitchClass(root, 3, 5),
        transposeSpelledPitchClass(root, 5, 9),
      ],
      compatibleScaleId: "scale.dorian",
      compatibleScaleName: "Dorian",
      guideTonesRetained: true,
      clashes: [],
      cautions: [],
      suggestedSymbol: `${rootStr}m11`,
      description: "Standard jazz minor ii chord color with natural 9, 11, and major 13.",
    });

    // Aeolian
    colorOptions.push({
      optionId: `${rootStr}M7_AEOLIAN`,
      family: "modal-color",
      title: "Natural Minor 9, 11, b13 (Aeolian)",
      tensions: ["9", "11", "b13"],
      resultingDegrees: ["1", "b3", "5", "b7", "9", "11", "b13"].map(parseDegreeString),
      omittedDegrees: [],
      spelledPitches: [
        root,
        transposeSpelledPitchClass(root, 2, 3),
        transposeSpelledPitchClass(root, 4, 7),
        transposeSpelledPitchClass(root, 6, 10),
        transposeSpelledPitchClass(root, 1, 2),
        transposeSpelledPitchClass(root, 3, 5),
        transposeSpelledPitchClass(root, 5, 8),
      ],
      compatibleScaleId: "scale.aeolian",
      compatibleScaleName: "Aeolian",
      guideTonesRetained: true,
      clashes: [],
      cautions: ["b13 creates minor 9th tension against 5th if both voiced closely."],
      suggestedSymbol: `${rootStr}m(b13)`,
      description: "Natural minor color with flat 6th (b13).",
    });
  }

  return {
    ok: true,
    schema: G6_COLOR_LAB_RESULT_SCHEMA,
    eventId,
    chordSymbol,
    colorOptions,
    upperStructureOptions,
    defaultColorIndex: 0,
  };
}
