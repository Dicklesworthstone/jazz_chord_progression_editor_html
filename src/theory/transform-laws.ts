import {
  type BeatValue,
  type ChordEventId,
  addBeatValues,
  normalizeBeatValue,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type TransformCandidate,
  type TransformEditOperation,
  type TransformEditPlan,
  type TransformLaw,
  type TransformLawFamily,
  type TransformLawId,
  type TransformOptions,
  type TransformResult,
  H1_TRANSFORM_RESULT_SCHEMA,
  MAX_H1_TRANSFORM_EVENTS,
} from "./transform-laws-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";

export const TRANSFORM_LAWS: readonly TransformLaw[] = Object.freeze([
  {
    lawId: "law.tritone-sub.primary",
    family: "tritone-substitute",
    title: "Tritone Substitution (subV7)",
    description: "Substitute dominant 7th chord with dominant 7th a tritone away sharing identical 3rd and 7th guide tones.",
    preconditions: {
      requiredTriads: ["major", "sus4"],
      requiredSevenths: ["minor"],
      targetHarmonicFunction: "dominant",
    },
    postconditions: {
      preservedGuideTones: true,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "half-step",
    },
    assumptions: ["Resolution target remains unchanged", "Root motion converts from 5th down to half-step down"],
    limitations: ["Changes altered/natural 9th and 13th color contexts"],
    harmonicExplanation: "The 3rd and 7th of G7 (B and F) invert to become the 7th and 3rd of Db7 (Cb and F).",
  },
  {
    lawId: "law.secondary-dominant.v-of-v",
    family: "secondary-dominant",
    title: "Secondary Dominant V7/V",
    description: "Replace diatonic ii chord with dominant quality (II7) tonicizing the upcoming dominant.",
    preconditions: {
      requiredTriads: ["minor"],
      requiredSevenths: ["minor"],
    },
    postconditions: {
      preservedGuideTones: false,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "stepwise",
    },
    assumptions: ["Next chord is dominant (V7)"],
    limitations: ["Raises 3rd of ii chord by half-step creating chromatic leading tone"],
    harmonicExplanation: "Converts ii chord (Dm7) to dominant quality (D7) to strongly tonicize V (G7).",
  },
  {
    lawId: "law.secondary-ii-v.insertion",
    family: "secondary-ii-v",
    title: "Secondary ii-V Insertion",
    description: "Interpolate or split dominant duration to insert its preceding related ii chord.",
    preconditions: {
      requiredTriads: ["major", "sus4"],
      requiredSevenths: ["minor"],
    },
    postconditions: {
      preservedGuideTones: true,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "stepwise",
    },
    assumptions: ["Event duration can be subdivided equally"],
    limitations: ["Increases harmonic rhythm density"],
    harmonicExplanation: "A 4-beat dominant (G7) splits into 2 beats of Dm7 and 2 beats of G7.",
  },
  {
    lawId: "law.backdoor.resolution",
    family: "backdoor-dominant",
    title: "Backdoor Dominant Resolution (bVII7 -> I)",
    description: "Substitute dominant cadence with bVII7 resolving up a whole step to Imaj7.",
    preconditions: {
      targetHarmonicFunction: "dominant",
    },
    postconditions: {
      preservedGuideTones: true,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "half-step",
    },
    assumptions: ["Resolution target is major tonic (Imaj7)"],
    limitations: ["Originates from parallel Aeolian / minor modal interchange"],
    harmonicExplanation: "Bb7 resolves to Cmaj7 via stepwise voice leading (Ab->G, D->C, F->E).",
  },
  {
    lawId: "law.modal-interchange.subdominant-minor",
    family: "modal-interchange",
    title: "Modal Interchange Subdominant Minor (ivm7)",
    description: "Borrow subdominant minor chord from parallel minor key for rich romantic/melancholic color.",
    preconditions: {
      requiredTriads: ["major"],
    },
    postconditions: {
      preservedGuideTones: true,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "stepwise",
    },
    assumptions: ["Context is major key"],
    limitations: ["Lowers major 3rd to minor 3rd (Ab in F minor)"],
    harmonicExplanation: "Fm7 provides smooth half-step voice leading (Ab->G) toward tonic or dominant.",
  },
  {
    lawId: "law.diminished.passing-sharp-one",
    family: "diminished-passing",
    title: "Ascending Passing Diminished (#Idim7)",
    description: "Insert #Idim7 between I and ii chords for chromatic bass line connection.",
    preconditions: {
      requiredTriads: ["major"],
    },
    postconditions: {
      preservedGuideTones: true,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "half-step",
    },
    assumptions: ["Next chord is ii (Dm7)"],
    limitations: ["Acts as inverted secondary dominant V7(b9)/ii with root omitted"],
    harmonicExplanation: "C#dim7 (C#-E-G-Bb) acts as A7b9/C# resolving smoothly to Dm7.",
  },
  {
    lawId: "law.dominant-chain.cycle",
    family: "dominant-chain",
    title: "Extended Dominant Cycle of Fifths Chain",
    description: "Extend dominant preparation backwards through cycle of fifths dominants.",
    preconditions: {
      requiredSevenths: ["minor"],
    },
    postconditions: {
      preservedGuideTones: true,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "stepwise",
    },
    assumptions: ["Chain resolves eventually to tonic"],
    limitations: ["Temporarily suspends diatonic key signature"],
    harmonicExplanation: "E7 -> A7 -> D7 -> G7 -> Cmaj7 forms a continuous dominant resolution chain.",
  },
  {
    lawId: "law.chromatic.half-step-above",
    family: "chromatic-approach",
    title: "Chromatic Approach from Half-Step Above",
    description: "Insert dominant 7th a half-step above target chord.",
    preconditions: {
      requiredSevenths: ["minor"],
    },
    postconditions: {
      preservedGuideTones: true,
      retainedResolutionTarget: true,
      preservesExactDuration: true,
      expectedVoiceLeadingMotion: "half-step",
    },
    assumptions: ["Approach chord precedes target by short duration"],
    limitations: ["Purely decorative voice-leading approach"],
    harmonicExplanation: "Ab7 slides down by half-step into G7.",
  },
]);

export function getTransformLaw(lawId: TransformLawId): TransformLaw | undefined {
  return TRANSFORM_LAWS.find((l) => l.lawId === lawId);
}

export function listTransformLaws(family?: TransformLawFamily): readonly TransformLaw[] {
  if (!family) return TRANSFORM_LAWS;
  return TRANSFORM_LAWS.filter((l) => l.family === family);
}

export function evaluateTransformCandidates(
  events: readonly {
    eventId: ChordEventId;
    chordSymbol: string;
    offsetBeat: BeatValue;
    duration: BeatValue;
  }[],
  targetIndex: number,
  options?: TransformOptions,
): TransformResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "h1.empty_target",
        message: "Progression contains no events to transform",
      },
    };
  }

  if (events.length > MAX_H1_TRANSFORM_EVENTS) {
    return {
      ok: false,
      refusal: {
        code: "h1.events_exceeded",
        message: `Progression exceeds maximum limit of ${String(MAX_H1_TRANSFORM_EVENTS)} events`,
      },
    };
  }

  if (targetIndex < 0 || targetIndex >= events.length) {
    return {
      ok: false,
      refusal: {
        code: "h1.empty_target",
        message: `Target index ${String(targetIndex)} is out of range [0..${String(events.length - 1)}]`,
      },
    };
  }

  const targetEvent = events[targetIndex];
  if (!targetEvent) {
    return {
      ok: false,
      refusal: {
        code: "h1.empty_target",
        message: "Target event not found",
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const parsed = parseChordSymbol(targetEvent.chordSymbol, accidentalStyle);
  if (!parsed.ok) {
    return {
      ok: false,
      refusal: {
        code: "h1.invalid_chord",
        message: `Invalid chord symbol: ${targetEvent.chordSymbol}`,
        eventId: targetEvent.eventId,
      },
    };
  }

  const chord = parsed.chord;
  const root = chord.root;
  const triad = chord.triad;
  const seventh = chord.seventh;
  const isDominant = (triad === "major" || triad === "sus4") && seventh === "minor";
  const isMinor = triad === "minor" && (seventh === "minor" || seventh === null);
  const isMajor = triad === "major" && (seventh === "major" || seventh === null);

  const candidates: TransformCandidate[] = [];
  const originalProgression = events.map((e) => e.chordSymbol);
  let workSteps = 0;

  // 1. Tritone substitution if dominant
  if (isDominant) {
    workSteps++;
    const tritoneRoot = transposeSpelledPitchClass(root, 4, 6);
    const tritoneRootStr = spelledPitchClassToString(tritoneRoot);
    const subChordSymbol = `${tritoneRootStr}7`;

    const transformedProgression = [...originalProgression];
    transformedProgression[targetIndex] = subChordSymbol;

    const op: TransformEditOperation = {
      kind: "replace",
      targetEventId: targetEvent.eventId,
      originalSymbol: targetEvent.chordSymbol,
      newSymbol: subChordSymbol,
      offsetBeat: targetEvent.offsetBeat,
      duration: targetEvent.duration,
    };

    const editPlan: TransformEditPlan = {
      operations: [op],
      totalOriginalDuration: targetEvent.duration,
      totalNewDuration: targetEvent.duration,
      maintainsTimeBalance: true,
    };

    candidates.push({
      candidateId: `cand_tritone_sub_${String(targetIndex)}`,
      lawId: "law.tritone-sub.primary",
      family: "tritone-substitute",
      title: `Tritone Substitution (${subChordSymbol} for ${targetEvent.chordSymbol})`,
      targetEventId: targetEvent.eventId,
      originalProgression,
      transformedProgression,
      editPlan,
      voiceLeadingScore: 95,
      harmonicTensionDelta: 2,
      explanation: `Substitutes ${targetEvent.chordSymbol} with ${subChordSymbol} sharing 3rd and 7th guide tones.`,
    });
  }

  // 2. Secondary dominant if minor ii chord
  if (isMinor) {
    workSteps++;
    const rootStr = spelledPitchClassToString(root);
    const secDomSymbol = `${rootStr}7`;
    const transformedProgression = [...originalProgression];
    transformedProgression[targetIndex] = secDomSymbol;

    const op: TransformEditOperation = {
      kind: "replace",
      targetEventId: targetEvent.eventId,
      originalSymbol: targetEvent.chordSymbol,
      newSymbol: secDomSymbol,
      offsetBeat: targetEvent.offsetBeat,
      duration: targetEvent.duration,
    };

    const editPlan: TransformEditPlan = {
      operations: [op],
      totalOriginalDuration: targetEvent.duration,
      totalNewDuration: targetEvent.duration,
      maintainsTimeBalance: true,
    };

    candidates.push({
      candidateId: `cand_sec_dom_${String(targetIndex)}`,
      lawId: "law.secondary-dominant.v-of-v",
      family: "secondary-dominant",
      title: `Secondary Dominant (${secDomSymbol} for ${targetEvent.chordSymbol})`,
      targetEventId: targetEvent.eventId,
      originalProgression,
      transformedProgression,
      editPlan,
      voiceLeadingScore: 85,
      harmonicTensionDelta: 3,
      explanation: `Converts ${targetEvent.chordSymbol} to ${secDomSymbol} tonicizing the upcoming chord.`,
    });
  }

  // 3. Secondary ii-V insertion if dominant with >= 2 beats
  if (isDominant) {
    workSteps++;
    const halfDurationNum = Math.floor(targetEvent.duration.numerator / (2 * targetEvent.duration.denominator));
    const halfBeatRes = normalizeBeatValue({ numerator: Math.max(1, halfDurationNum), denominator: 1 });
    const halfBeat = halfBeatRes.ok ? halfBeatRes.value : targetEvent.duration;
    const iiRoot = transposeSpelledPitchClass(root, 4, 7);
    const iiRootStr = spelledPitchClassToString(iiRoot);
    const iiChordSymbol = `${iiRootStr}m7`;

    const transformedProgression = [...originalProgression];
    transformedProgression.splice(targetIndex, 1, iiChordSymbol, targetEvent.chordSymbol);

    const op1: TransformEditOperation = {
      kind: "split",
      targetEventId: targetEvent.eventId,
      originalSymbol: targetEvent.chordSymbol,
      newSymbol: iiChordSymbol,
      offsetBeat: targetEvent.offsetBeat,
      duration: halfBeat,
    };
    const addRes = addBeatValues(targetEvent.offsetBeat, halfBeat);
    const op2Offset = addRes.ok ? addRes.value : targetEvent.offsetBeat;

    const op2: TransformEditOperation = {
      kind: "insert",
      targetEventId: targetEvent.eventId,
      originalSymbol: targetEvent.chordSymbol,
      newSymbol: targetEvent.chordSymbol,
      offsetBeat: op2Offset,
      duration: halfBeat,
    };

    const editPlan: TransformEditPlan = {
      operations: [op1, op2],
      totalOriginalDuration: targetEvent.duration,
      totalNewDuration: targetEvent.duration,
      maintainsTimeBalance: true,
    };

    candidates.push({
      candidateId: `cand_ii_v_insert_${String(targetIndex)}`,
      lawId: "law.secondary-ii-v.insertion",
      family: "secondary-ii-v",
      title: `Insert related ii chord (${iiChordSymbol} -> ${targetEvent.chordSymbol})`,
      targetEventId: targetEvent.eventId,
      originalProgression,
      transformedProgression,
      editPlan,
      voiceLeadingScore: 90,
      harmonicTensionDelta: 1,
      explanation: `Precedes ${targetEvent.chordSymbol} with its related ii chord ${iiChordSymbol}.`,
    });
  }

  // 4. Modal interchange if major subdominant (IV)
  if (isMajor) {
    workSteps++;
    const rootStr = spelledPitchClassToString(root);
    const subMinorSymbol = `${rootStr}m7`;
    const transformedProgression = [...originalProgression];
    transformedProgression[targetIndex] = subMinorSymbol;

    const op: TransformEditOperation = {
      kind: "replace",
      targetEventId: targetEvent.eventId,
      originalSymbol: targetEvent.chordSymbol,
      newSymbol: subMinorSymbol,
      offsetBeat: targetEvent.offsetBeat,
      duration: targetEvent.duration,
    };

    const editPlan: TransformEditPlan = {
      operations: [op],
      totalOriginalDuration: targetEvent.duration,
      totalNewDuration: targetEvent.duration,
      maintainsTimeBalance: true,
    };

    candidates.push({
      candidateId: `cand_modal_interchange_${String(targetIndex)}`,
      lawId: "law.modal-interchange.subdominant-minor",
      family: "modal-interchange",
      title: `Subdominant Minor Modal Interchange (${subMinorSymbol})`,
      targetEventId: targetEvent.eventId,
      originalProgression,
      transformedProgression,
      editPlan,
      voiceLeadingScore: 90,
      harmonicTensionDelta: 2,
      explanation: `Replaces ${targetEvent.chordSymbol} with parallel minor subdominant ${subMinorSymbol}.`,
    });
  }

  const maxCandidates = options?.maxCandidates ?? 10;

  return {
    ok: true,
    schema: H1_TRANSFORM_RESULT_SCHEMA,
    candidates: candidates.slice(0, maxCandidates),
    workSteps,
  };
}
