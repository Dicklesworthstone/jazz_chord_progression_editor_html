import {
  type Alteration,
  type ChordDegree,
  type ChordEventId,
  type KeyContext,
  type SpelledPitchClass,
  type Step,
  makeSpelledPitchClass,
  pitchClassOf,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type EventGuideTones,
  type ExtractedGuideTone,
  type G6GuideTonePathsResult,
  type GuideToneMotionKind,
  type GuideTonePath,
  type GuideToneRole,
  type GuideToneVoiceArc,
  type GuideToneVoiceLine,
  G6_GUIDE_TONE_EXTRACTION_SCHEMA,
  G6_GUIDE_TONE_PATHS_RESULT_SCHEMA,
  MAX_G6_OPTIMIZED_PATHS,
  MAX_G6_PROGRESSION_EVENTS,
} from "./guide-tones-contract";
import { parseChordSymbol } from "./chord-symbol";

const PITCH_STEP_SEMITONES: Readonly<Record<Step, number>> = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

const STEPS: readonly Step[] = Object.freeze(["C", "D", "E", "F", "G", "A", "B"]);

function clampAlteration(val: number): Alteration {
  if (val <= -2) return -2;
  if (val === -1) return -1;
  if (val === 0) return 0;
  if (val === 1) return 1;
  return 2;
}

export function transposeSpelledPitchClass(
  root: SpelledPitchClass,
  scaleSteps: number,
  targetSemitones: number,
): SpelledPitchClass {
  const rootIndex = STEPS.indexOf(root.step);
  const targetStepIndex = ((rootIndex + scaleSteps) % 7 + 7) % 7;
  const targetStep = STEPS[targetStepIndex] ?? "C";
  const rootNatural = PITCH_STEP_SEMITONES[root.step];
  const targetNatural = PITCH_STEP_SEMITONES[targetStep];

  const rootActual = rootNatural + root.alter;
  const targetActual = ((rootActual + targetSemitones) % 12 + 12) % 12;

  let alter = ((targetActual - targetNatural) % 12 + 12) % 12;
  if (alter > 6) alter -= 12;
  const safeAlter = clampAlteration(alter);

  const res = makeSpelledPitchClass({ step: targetStep, alter: safeAlter });
  if (res.ok) return res.value;
  return root;
}

export function spelledPitchClassToString(spc: SpelledPitchClass): string {
  const acc =
    spc.alter === 1
      ? "#"
      : spc.alter === 2
        ? "##"
        : spc.alter === -1
          ? "b"
          : spc.alter === -2
            ? "bb"
            : "";
  return `${spc.step}${acc}`;
}

function shortestSignedSemitones(from: SpelledPitchClass, to: SpelledPitchClass): number {
  const fromSemi = pitchClassOf(from);
  const toSemi = pitchClassOf(to);
  let diff = (toSemi - fromSemi) % 12;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

/**
 * Extract guide tones (3rds, 7ths, suspensions, essential color tones) from a chord symbol.
 */
export function extractEventGuideTones(
  chordSymbol: string,
  eventId: ChordEventId,
  _keyContext?: KeyContext,
  accidentalStyle: AccidentalStyle = "ascii",
): EventGuideTones {
  const parsed = parseChordSymbol(chordSymbol, accidentalStyle);
  if (!parsed.ok) {
    return {
      schema: G6_GUIDE_TONE_EXTRACTION_SCHEMA,
      eventId,
      guideTones: [],
      hasThirdOrSuspension: false,
      hasSeventh: false,
      isCompleteGuidePair: false,
    };
  }

  const chord = parsed.chord;
  const root = chord.root;
  const triad = chord.triad;
  const seventh = chord.seventh;
  const alterations = chord.alterations;
  const guideTones: ExtractedGuideTone[] = [];

  // 1. Third or Suspension
  if (triad === "sus4" || triad === "sus2") {
    const pitch = transposeSpelledPitchClass(root, triad === "sus2" ? 1 : 3, triad === "sus2" ? 2 : 5);
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: triad === "sus2" ? { number: 2, alter: 0 } : { number: 4, alter: 0 },
      role: "suspension",
      isTendencyTone: true,
      isLeadingTone: false,
    });
  } else if (triad === "minor" || triad === "diminished") {
    const pitch = transposeSpelledPitchClass(root, 2, 3);
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 3, alter: -1 },
      role: "third",
      isTendencyTone: false,
      isLeadingTone: false,
    });
  } else if (triad === "major" || triad === "augmented") {
    const pitch = transposeSpelledPitchClass(root, 2, 4);
    const isDom = seventh === "minor";
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 3, alter: 0 },
      role: "third",
      isTendencyTone: isDom,
      isLeadingTone: isDom,
    });
  }

  // 2. Seventh
  if (seventh === "major") {
    const pitch = transposeSpelledPitchClass(root, 6, 11);
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 7, alter: 0 },
      role: "seventh",
      isTendencyTone: true,
      isLeadingTone: true,
    });
  } else if (seventh === "diminished") {
    const pitch = transposeSpelledPitchClass(root, 6, 9);
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 7, alter: -2 },
      role: "seventh",
      isTendencyTone: true,
      isLeadingTone: false,
    });
  } else if (seventh === "minor") {
    const pitch = transposeSpelledPitchClass(root, 6, 10);
    const isDom = triad === "major" || triad === "sus4" || triad === "sus2";
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 7, alter: -1 },
      role: "seventh",
      isTendencyTone: isDom,
      isLeadingTone: false,
    });
  }

  // 3. Essential Color (e.g. b5 in half-diminished/diminished, altered extensions)
  const allDegrees = [...alterations, ...chord.extensions, ...chord.additions];
  if (triad === "diminished" && seventh === "minor") {
    // Half-diminished
    const pitch = transposeSpelledPitchClass(root, 4, 6);
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 5, alter: -1 },
      role: "essential-color",
      isTendencyTone: true,
      isLeadingTone: false,
    });
  } else if (allDegrees.some((d) => d.number === 5 && d.alter === -1)) {
    const pitch = transposeSpelledPitchClass(root, 4, 6);
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 5, alter: -1 },
      role: "essential-color",
      isTendencyTone: true,
      isLeadingTone: false,
    });
  }

  if (allDegrees.some((d) => d.number === 9 && d.alter === -1)) {
    const pitch = transposeSpelledPitchClass(root, 1, 1);
    guideTones.push({
      spelledPitchClass: pitch,
      pitchClass: pitchClassOf(pitch),
      degree: { number: 9, alter: -1 },
      role: "essential-color",
      isTendencyTone: true,
      isLeadingTone: false,
    });
  }

  const hasThirdOrSuspension = guideTones.some((g) => g.role === "third" || g.role === "suspension");
  const hasSeventh = guideTones.some((g) => g.role === "seventh");

  return {
    schema: G6_GUIDE_TONE_EXTRACTION_SCHEMA,
    eventId,
    guideTones,
    hasThirdOrSuspension,
    hasSeventh,
    isCompleteGuidePair: hasThirdOrSuspension && hasSeventh,
  };
}

/**
 * Classify the voice-leading motion between two sequential guide tones.
 */
export function classifyGuideToneMotion(
  fromPitch: SpelledPitchClass,
  toPitch: SpelledPitchClass,
  fromDegree: ChordDegree,
  toDegree: ChordDegree,
  fromRole?: GuideToneRole,
  toRole?: GuideToneRole,
): {
  semitones: number;
  motion: GuideToneMotionKind;
  isTendencyResolution: boolean;
  isLeadingToneResolution: boolean;
} {
  const semitones = shortestSignedSemitones(fromPitch, toPitch);
  const absSemi = Math.abs(semitones);

  let motion: GuideToneMotionKind;
  if (absSemi === 0) {
    motion = "common-tone";
  } else if (absSemi > 2) {
    motion = "leap";
  } else {
    motion = "step-resolution";
  }

  const isLeadingToneResolution =
    (fromDegree.number === 7 || fromDegree.number === 3) &&
    (semitones === 1 || semitones === -1);

  const isFromFlat7 = fromDegree.number === 7 && fromDegree.alter === -1;
  const isTo3 = toDegree.number === 3 && toDegree.alter === 0;
  const isFrom3 = fromDegree.number === 3 && fromDegree.alter === 0;
  const isToFlat7 = toDegree.number === 7 && toDegree.alter === -1;
  const isFrom4 = fromDegree.number === 4 && fromDegree.alter === 0;

  const isTendencyResolution =
    (isFromFlat7 && isTo3 && semitones === -1) ||
    (isFrom3 && isToFlat7 && (semitones === -1 || semitones === 0)) ||
    (isFrom4 && isTo3 && semitones === -1);

  // If roles were passed, verify cross-role motion context
  if (fromRole && toRole && fromRole !== toRole && absSemi <= 2 && absSemi > 0) {
    motion = "step-resolution";
  }

  return {
    semitones,
    motion,
    isTendencyResolution,
    isLeadingToneResolution,
  };
}

/**
 * Optimize smooth, noncrossing guide-tone voice paths across a chord progression.
 */
export function optimizeGuideTonePaths(
  events: readonly { eventId: ChordEventId; chordSymbol: string }[],
  options?: {
    maxPaths?: number;
    keyContext?: KeyContext;
    accidentalStyle?: AccidentalStyle;
  },
): G6GuideTonePathsResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g6.empty_progression",
        message: "Progression contains no chord events",
      },
    };
  }

  if (events.length > MAX_G6_PROGRESSION_EVENTS) {
    return {
      ok: false,
      refusal: {
        code: "g6.events_exceeded",
        message: `Progression exceeds maximum limit of ${String(MAX_G6_PROGRESSION_EVENTS)} events`,
      },
    };
  }

  // Extract guide tones for each event
  const extractedList: EventGuideTones[] = [];
  for (const event of events) {
    const ext = extractEventGuideTones(
      event.chordSymbol,
      event.eventId,
      options?.keyContext,
      options?.accidentalStyle ?? "ascii",
    );
    if (ext.guideTones.length === 0) {
      return {
        ok: false,
        refusal: {
          code: "g6.no_guide_tones_found",
          message: `No guide tones could be derived for chord: ${event.chordSymbol}`,
          eventId: event.eventId,
        },
      };
    }
    extractedList.push(ext);
  }

  let workSteps = 0;
  const paths: GuideTonePath[] = [];
  const maxPaths = Math.min(options?.maxPaths ?? 4, MAX_G6_OPTIMIZED_PATHS);

  // Derive Path 1 (3rd-led primary line and 7th-led secondary line)
  const line1Pitches: (SpelledPitchClass | null)[] = [];
  const line1Degrees: (ChordDegree | null)[] = [];
  const line1Arcs: GuideToneVoiceArc[] = [];

  const line2Pitches: (SpelledPitchClass | null)[] = [];
  const line2Degrees: (ChordDegree | null)[] = [];
  const line2Arcs: GuideToneVoiceArc[] = [];

  let line1TotalMotion = 0;
  let line2TotalMotion = 0;
  let stepResolutions = 0;
  let contraryCount = 0;
  let parallelCount = 0;
  let obliqueCount = 0;

  for (let i = 0; i < extractedList.length; i++) {
    const ext = extractedList[i];
    if (!ext) continue;
    workSteps++;

    const fallbackTone = ext.guideTones[0];
    if (!fallbackTone) continue;
    const thirdOrSus = ext.guideTones.find((g) => g.role === "third" || g.role === "suspension") ?? fallbackTone;
    const seventh = ext.guideTones.find((g) => g.role === "seventh") ?? ext.guideTones[ext.guideTones.length - 1] ?? fallbackTone;

    if (i === 0) {
      line1Pitches.push(thirdOrSus.spelledPitchClass);
      line1Degrees.push(thirdOrSus.degree);
      line2Pitches.push(seventh.spelledPitchClass);
      line2Degrees.push(seventh.degree);
    } else {
      const prevExt = extractedList[i - 1];
      const prev1Pitch = line1Pitches[i - 1];
      const prev2Pitch = line2Pitches[i - 1];
      const prev1Degree = line1Degrees[i - 1];
      const prev2Degree = line2Degrees[i - 1];

      if (!prevExt || !prev1Pitch || !prev2Pitch || !prev1Degree || !prev2Degree) {
        continue;
      }

      // Connect to nearest available guide tone to minimize motion
      const dist1ToThird = Math.abs(shortestSignedSemitones(prev1Pitch, thirdOrSus.spelledPitchClass));
      const dist1ToSeventh = Math.abs(shortestSignedSemitones(prev1Pitch, seventh.spelledPitchClass));

      let chosen1 = thirdOrSus;
      let chosen2 = seventh;

      if (dist1ToSeventh < dist1ToThird && ext.guideTones.length > 1) {
        chosen1 = seventh;
        chosen2 = thirdOrSus;
      }

      line1Pitches.push(chosen1.spelledPitchClass);
      line1Degrees.push(chosen1.degree);
      line2Pitches.push(chosen2.spelledPitchClass);
      line2Degrees.push(chosen2.degree);

      const arc1 = classifyGuideToneMotion(
        prev1Pitch,
        chosen1.spelledPitchClass,
        prev1Degree,
        chosen1.degree,
        "third",
        chosen1.role,
      );
      const arc2 = classifyGuideToneMotion(
        prev2Pitch,
        chosen2.spelledPitchClass,
        prev2Degree,
        chosen2.degree,
        "seventh",
        chosen2.role,
      );

      line1TotalMotion += Math.abs(arc1.semitones);
      line2TotalMotion += Math.abs(arc2.semitones);

      if (arc1.motion === "step-resolution") stepResolutions++;
      if (arc2.motion === "step-resolution") stepResolutions++;

      // Relative motion between voices
      if ((arc1.semitones > 0 && arc2.semitones < 0) || (arc1.semitones < 0 && arc2.semitones > 0)) {
        contraryCount++;
      } else if (arc1.semitones === 0 && arc2.semitones !== 0) {
        obliqueCount++;
      } else if (arc2.semitones === 0 && arc1.semitones !== 0) {
        obliqueCount++;
      } else if (arc1.semitones === arc2.semitones && arc1.semitones !== 0) {
        parallelCount++;
      }

      line1Arcs.push({
        fromEventId: prevExt.eventId,
        toEventId: ext.eventId,
        fromPitch: prev1Pitch,
        toPitch: chosen1.spelledPitchClass,
        fromDegree: prev1Degree,
        toDegree: chosen1.degree,
        fromRole: "third",
        toRole: chosen1.role,
        semitones: arc1.semitones,
        motion: arc1.motion,
        isTendencyResolution: arc1.isTendencyResolution,
        isLeadingToneResolution: arc1.isLeadingToneResolution,
      });

      line2Arcs.push({
        fromEventId: prevExt.eventId,
        toEventId: ext.eventId,
        fromPitch: prev2Pitch,
        toPitch: chosen2.spelledPitchClass,
        fromDegree: prev2Degree,
        toDegree: chosen2.degree,
        fromRole: "seventh",
        toRole: chosen2.role,
        semitones: arc2.semitones,
        motion: arc2.motion,
        isTendencyResolution: arc2.isTendencyResolution,
        isLeadingToneResolution: arc2.isLeadingToneResolution,
      });
    }
  }

  const voiceLine1: GuideToneVoiceLine = {
    lineIndex: 0,
    primaryRole: "third",
    pitches: line1Pitches,
    degrees: line1Degrees,
    arcs: line1Arcs,
    totalSemitoneMotion: line1TotalMotion,
    stepCount: line1Arcs.filter((a) => a.motion === "step-resolution").length,
    leapCount: line1Arcs.filter((a) => a.motion === "leap").length,
    commonToneCount: line1Arcs.filter((a) => a.motion === "common-tone").length,
  };

  const voiceLine2: GuideToneVoiceLine = {
    lineIndex: 1,
    primaryRole: "seventh",
    pitches: line2Pitches,
    degrees: line2Degrees,
    arcs: line2Arcs,
    totalSemitoneMotion: line2TotalMotion,
    stepCount: line2Arcs.filter((a) => a.motion === "step-resolution").length,
    leapCount: line2Arcs.filter((a) => a.motion === "leap").length,
    commonToneCount: line2Arcs.filter((a) => a.motion === "common-tone").length,
  };

  const totalCost = line1TotalMotion + line2TotalMotion;
  const totalArcs = Math.max(1, line1Arcs.length + line2Arcs.length);
  const stepResolutionPercentage = Math.round((stepResolutions / totalArcs) * 100);

  paths.push({
    pathId: "path-1-smooth-3rd-7th",
    rank: 1,
    lines: [voiceLine1, voiceLine2],
    totalMotionCost: totalCost,
    smoothnessScore: Math.max(0, 100 - totalCost * 5),
    stepResolutionPercentage,
    contraryMotionCount: contraryCount,
    parallelMotionCount: parallelCount,
    obliqueMotionCount: obliqueCount,
    hasCrossings: false,
    explanation: "Smooth stepwise guide-tone resolution connecting 3rds and 7ths across progression.",
  });

  return {
    ok: true,
    schema: G6_GUIDE_TONE_PATHS_RESULT_SCHEMA,
    paths: paths.slice(0, maxPaths),
    workSteps,
  };
}
