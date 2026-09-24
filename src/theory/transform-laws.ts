import {
  type BeatValue,
  type ChordEventId,
  addBeatValues,
  normalizeBeatValue,
  pitchClassOf,
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
    /* The tritone is a diminished 5th (G7 -> Db7) or an augmented 4th
       (Ab7 -> D7); take the spelling with fewer accidentals, never Ebb7. */
    const diminishedFifth = transposeSpelledPitchClass(root, 4, 6);
    const augmentedFourth = transposeSpelledPitchClass(root, 3, 6);
    const tritoneRoot =
      Math.abs(augmentedFourth.alter) < Math.abs(diminishedFifth.alter) ? augmentedFourth : diminishedFifth;
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
      title: `Tritone substitute (${subChordSymbol} for ${targetEvent.chordSymbol})`,
      targetEventId: targetEvent.eventId,
      originalProgression,
      transformedProgression,
      editPlan,
      voiceLeadingScore: 95,
      harmonicTensionDelta: 2,
      explanation: `Substitutes ${targetEvent.chordSymbol} with ${subChordSymbol} sharing 3rd and 7th guide tones.`,
    });
  }

  // 2. Secondary dominant if minor ii chord. The D7 only tonicizes what
  //    follows when that chord's root is a fourth above (Dm7 G7 -> D7 G7);
  //    before anything else "tonicizing the upcoming chord" would be false.
  const followingParsed = targetIndex + 1 < events.length
    ? parseChordSymbol(events[targetIndex + 1]?.chordSymbol ?? "", accidentalStyle)
    : null;
  const resolvesUpAFourth =
    followingParsed?.ok === true &&
    pitchClassOf(followingParsed.chord.root) === (pitchClassOf(root) + 5) % 12;
  if (isMinor && resolvesUpAFourth) {
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
      title: `Secondary dominant (${secDomSymbol} for ${targetEvent.chordSymbol})`,
      targetEventId: targetEvent.eventId,
      originalProgression,
      transformedProgression,
      editPlan,
      voiceLeadingScore: 85,
      harmonicTensionDelta: 3,
      explanation: `Converts ${targetEvent.chordSymbol} to ${secDomSymbol} tonicizing the upcoming chord.`,
    });
  }

  // 3. Secondary ii-V insertion: split the dominant into two exact halves.
  //    (Whole-beat flooring once turned 3 beats into 1 + 1 while claiming 3.)
  const halfBeatRes = normalizeBeatValue({
    numerator: targetEvent.duration.numerator,
    denominator: targetEvent.duration.denominator * 2,
  });
  const secondHalfRes = halfBeatRes.ok ? addBeatValues(targetEvent.offsetBeat, halfBeatRes.value) : null;
  const newTotalRes = halfBeatRes.ok ? addBeatValues(halfBeatRes.value, halfBeatRes.value) : null;
  const iiRoot = transposeSpelledPitchClass(root, 4, 7);
  /* Skip when the related ii already precedes this dominant (Dm7 G7): the
     insertion would only repeat it. */
  const previousParsed = targetIndex > 0 ? parseChordSymbol(events[targetIndex - 1]?.chordSymbol ?? "", accidentalStyle) : null;
  const iiAlreadyPrecedes =
    previousParsed?.ok === true &&
    pitchClassOf(previousParsed.chord.root) === pitchClassOf(iiRoot) &&
    previousParsed.chord.triad === "minor";
  if (isDominant && !iiAlreadyPrecedes && halfBeatRes.ok && secondHalfRes?.ok === true && newTotalRes?.ok === true) {
    workSteps++;
    const halfBeat = halfBeatRes.value;
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
    const op2: TransformEditOperation = {
      kind: "insert",
      targetEventId: targetEvent.eventId,
      originalSymbol: targetEvent.chordSymbol,
      newSymbol: targetEvent.chordSymbol,
      offsetBeat: secondHalfRes.value,
      duration: halfBeat,
    };

    const newTotal = newTotalRes.value;
    const editPlan: TransformEditPlan = {
      operations: [op1, op2],
      totalOriginalDuration: targetEvent.duration,
      totalNewDuration: newTotal,
      /* Computed, not asserted: the halves must sum to the original. */
      maintainsTimeBalance:
        newTotal.numerator * targetEvent.duration.denominator ===
        targetEvent.duration.numerator * newTotal.denominator,
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
    /* A plain triad borrows a plain minor triad; a seventh chord keeps its seventh. */
    const subMinorSymbol = seventh === null ? `${rootStr}m` : `${rootStr}m7`;
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
      /* No key is known here, so this is honestly a parallel-minor borrow;
         it is the classic "subdominant minor" only when the chord is IV. */
      title: `Parallel minor borrow (${subMinorSymbol} for ${targetEvent.chordSymbol})`,
      targetEventId: targetEvent.eventId,
      originalProgression,
      transformedProgression,
      editPlan,
      voiceLeadingScore: 90,
      harmonicTensionDelta: 2,
      explanation: `Borrows the minor colour of the same root: ${subMinorSymbol} for ${targetEvent.chordSymbol}. On a IV chord this is the classic subdominant minor.`,
    });
  }

  /* The remaining laws all hang on the chord that follows the target. */
  const next = followingParsed?.ok === true ? followingParsed.chord : null;
  const nextSymbol = events[targetIndex + 1]?.chordSymbol ?? "";
  /** An exact spelling, or null when the letter would need a triple accidental. */
  const spelledAt = (from: typeof root, steps: number, semitones: number): string | null => {
    const spelled = transposeSpelledPitchClass(from, steps, semitones);
    return pitchClassOf(spelled) === (pitchClassOf(from) + semitones + 120) % 12
      ? spelledPitchClassToString(spelled)
      : null;
  };
  /** Of two spellings of one pitch, the one with fewer accidentals (the first on a tie). */
  const plainer = (from: typeof root, semitones: number, steps: number, otherSteps: number): string | null => {
    const first = transposeSpelledPitchClass(from, steps, semitones);
    const other = transposeSpelledPitchClass(from, otherSteps, semitones);
    const pick = Math.abs(other.alter) < Math.abs(first.alter) ? { spelled: other, steps: otherSteps } : { spelled: first, steps };
    return spelledAt(from, pick.steps, semitones);
  };
  /** Keep the target for one exact half and give the other half to a new chord. */
  const splitWith = (
    newSymbol: string,
    newFirst: boolean,
  ): TransformEditPlan | null => {
    if (!halfBeatRes.ok || secondHalfRes?.ok !== true || newTotalRes?.ok !== true) return null;
    const half = halfBeatRes.value;
    const [firstSymbol, secondSymbol] = newFirst
      ? [newSymbol, targetEvent.chordSymbol]
      : [targetEvent.chordSymbol, newSymbol];
    const newTotal = newTotalRes.value;
    return {
      operations: [
        { kind: "split", targetEventId: targetEvent.eventId, originalSymbol: targetEvent.chordSymbol,
          newSymbol: firstSymbol, offsetBeat: targetEvent.offsetBeat, duration: half },
        { kind: "insert", targetEventId: targetEvent.eventId, originalSymbol: targetEvent.chordSymbol,
          newSymbol: secondSymbol, offsetBeat: secondHalfRes.value, duration: half },
      ],
      totalOriginalDuration: targetEvent.duration,
      totalNewDuration: newTotal,
      maintainsTimeBalance:
        newTotal.numerator * targetEvent.duration.denominator ===
        targetEvent.duration.numerator * newTotal.denominator,
    };
  };
  const pushCandidate = (
    lawId: TransformLawId,
    family: TransformLawFamily,
    idStem: string,
    title: string,
    explanation: string,
    editPlan: TransformEditPlan,
    voiceLeadingScore: number,
    harmonicTensionDelta: number,
  ): void => {
    workSteps++;
    const transformedProgression = [...originalProgression];
    transformedProgression.splice(targetIndex, 1, ...editPlan.operations.map((op) => op.newSymbol));
    candidates.push({
      candidateId: `cand_${idStem}_${String(targetIndex)}`, lawId, family, title,
      targetEventId: targetEvent.eventId, originalProgression, transformedProgression, editPlan,
      voiceLeadingScore, harmonicTensionDelta, explanation,
    });
  };
  const nextIsMajorTonic = next !== null && next.triad === "major" && next.seventh !== "minor";

  // 5. Backdoor: a V7 resolving up a fourth to a major chord may be replaced
  //    by bVII7 of that chord (G7 -> Cmaj7 becomes Bb7 -> Cmaj7).
  if (isDominant && next !== null && nextIsMajorTonic &&
    pitchClassOf(next.root) === (pitchClassOf(root) + 5) % 12) {
    const flatSeven = spelledAt(next.root, 6, 10);
    if (flatSeven !== null) {
      const symbol = `${flatSeven}7`;
      pushCandidate("law.backdoor.resolution", "backdoor-dominant", "backdoor",
        `Backdoor dominant (${symbol} for ${targetEvent.chordSymbol})`,
        `${symbol} is the flat-seven dominant of ${nextSymbol}: it reaches the same chord from a whole step below instead of a fifth above.`,
        { operations: [{ kind: "replace", targetEventId: targetEvent.eventId, originalSymbol: targetEvent.chordSymbol,
          newSymbol: symbol, offsetBeat: targetEvent.offsetBeat, duration: targetEvent.duration }],
        totalOriginalDuration: targetEvent.duration, totalNewDuration: targetEvent.duration, maintainsTimeBalance: true },
        85, 2);
    }
  }

  // 6. Passing diminished: a major chord moving up a whole step to a minor
  //    chord gives its second half to the diminished chord a half step above
  //    it (Cmaj7 Dm7 becomes Cmaj7 C#dim7 Dm7): the bass rises by half steps.
  if (isMajor && next !== null && next.triad === "minor" &&
    pitchClassOf(next.root) === (pitchClassOf(root) + 2) % 12) {
    // #I (C -> C#), unless a raised letter needs more accidentals (F# -> G, not F##).
    const sharpOne = plainer(root, 1, 0, 1);
    const plan = sharpOne === null ? null : splitWith(`${sharpOne}dim7`, false);
    if (sharpOne !== null && plan !== null) {
      pushCandidate("law.diminished.passing-sharp-one", "diminished-passing", "passing_dim",
        `Passing diminished (${sharpOne}dim7 into ${nextSymbol})`,
        `${targetEvent.chordSymbol} gives its second half to ${sharpOne}dim7, so the bass climbs by half steps into ${nextSymbol}.`,
        plan, 88, 2);
    }
  }

  // 7. Dominant chain: a dominant not already prepared by the chord a fifth
  //    above gives its first half to its own dominant (G7 becomes D7 G7).
  const preparedFromAFifth = previousParsed?.ok === true &&
    pitchClassOf(previousParsed.chord.root) === (pitchClassOf(root) + 7) % 12;
  if (isDominant && !preparedFromAFifth) {
    const fifth = spelledAt(root, 4, 7);
    const plan = fifth === null ? null : splitWith(`${fifth}7`, true);
    if (fifth !== null && plan !== null) {
      pushCandidate("law.dominant-chain.cycle", "dominant-chain", "dominant_chain",
        `Add its own dominant (${fifth}7 -> ${targetEvent.chordSymbol})`,
        `${fifth}7 is the dominant of ${targetEvent.chordSymbol}; putting it first extends the chain of dominants one link back around the cycle of fifths.`,
        plan, 85, 2);
    }
  }

  // 8. Chromatic approach: the chord gives its first half to the dominant a
  //    half step above it, which slides down into it (G7 becomes Ab7 G7),
  //    unless the chord before already does exactly that.
  const approachedAlready = previousParsed?.ok === true &&
    pitchClassOf(previousParsed.chord.root) === (pitchClassOf(root) + 1) % 12;
  if (!approachedAlready) {
    // A minor 2nd above (G -> Ab), unless that letter needs more (Db -> D, not Ebb).
    const above = plainer(root, 1, 1, 0);
    const plan = above === null ? null : splitWith(`${above}7`, true);
    if (above !== null && plan !== null) {
      pushCandidate("law.chromatic.half-step-above", "chromatic-approach", "chromatic_above",
        `Chromatic approach (${above}7 into ${targetEvent.chordSymbol})`,
        `${above}7 sits a half step above ${targetEvent.chordSymbol} and slides down into it.`,
        plan, 80, 3);
    }
  }

  const maxCandidates = options?.maxCandidates ?? 10;

  return {
    ok: true,
    schema: H1_TRANSFORM_RESULT_SCHEMA,
    candidates: candidates.slice(0, maxCandidates),
    workSteps,
  };
}
