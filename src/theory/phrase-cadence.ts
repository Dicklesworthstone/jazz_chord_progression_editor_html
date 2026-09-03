import {
  type ChordEventId,
  pitchClassOf,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type CadenceEvidence,
  type CadenceType,
} from "./tonal-journey-contract";
import { parseChordSymbol } from "./chord-symbol";

export function detectCadence(
  fromChordSymbol: string,
  toChordSymbol: string,
  fromEventId: ChordEventId,
  toEventId: ChordEventId,
  metricContext?: { fromStrong?: boolean; toStrong?: boolean },
  accidentalStyle: AccidentalStyle = "ascii",
): CadenceEvidence | null {
  const fromParsed = parseChordSymbol(fromChordSymbol, accidentalStyle);
  const toParsed = parseChordSymbol(toChordSymbol, accidentalStyle);

  if (!fromParsed.ok || !toParsed.ok) {
    return null;
  }

  const fromChord = fromParsed.chord;
  const toChord = toParsed.chord;

  const fromRoot = fromChord.root;
  const toRoot = toChord.root;

  const rootDiff = ((pitchClassOf(toRoot) - pitchClassOf(fromRoot)) % 12 + 12) % 12;

  const isFromDominant =
    (fromChord.triad === "major" || fromChord.triad === "sus4") && fromChord.seventh === "minor";
  const isToMajor = toChord.triad === "major";
  const isToMinor = toChord.triad === "minor";

  const metricStrength = metricContext?.toStrong ? 90 : 75;

  // 1. Authentic Cadence: V7 -> I or V7 -> i (root motion up 5 semitones / down 7 semitones)
  if (isFromDominant && (isToMajor || isToMinor) && rootDiff === 5) {
    const isToMaj7 = toChord.seventh === "major" || toChord.seventh === null;
    const cadenceType: CadenceType = isToMaj7 ? "perfect-authentic" : "imperfect-authentic";
    return {
      cadenceType,
      status: "closed",
      fromEventId,
      toEventId,
      metricStrength,
      harmonicStrength: 100,
      explanation: `Authentic cadence from dominant ${fromChordSymbol} to tonic ${toChordSymbol} with root falling a fifth.`,
    };
  }

  // 2. Backdoor Cadence: bVII7 -> I (root motion up 2 semitones / down 10 semitones)
  if (isFromDominant && isToMajor && rootDiff === 2) {
    return {
      cadenceType: "backdoor",
      status: "supported",
      fromEventId,
      toEventId,
      metricStrength: 80,
      harmonicStrength: 90,
      explanation: `Backdoor cadence from subtonic dominant ${fromChordSymbol} to tonic ${toChordSymbol}.`,
    };
  }

  // 3. Deceptive Cadence: V7 -> vi (root motion up 9 semitones / down 3 semitones)
  if (isFromDominant && isToMinor && rootDiff === 9) {
    return {
      cadenceType: "deceptive",
      status: "supported",
      fromEventId,
      toEventId,
      metricStrength: 70,
      harmonicStrength: 85,
      explanation: `Deceptive cadence from dominant ${fromChordSymbol} resolving deceptively to submediant ${toChordSymbol}.`,
    };
  }

  // 4. Half Cadence: ending on V7 from ii (root motion up 7 semitones) or IV (root up 2) or I (root up 7)
  if (!isFromDominant && isToDominantEnding(toChordSymbol) && (rootDiff === 7 || rootDiff === 2)) {
    return {
      cadenceType: "half",
      status: "supported",
      fromEventId,
      toEventId,
      metricStrength: 75,
      harmonicStrength: 80,
      explanation: `Half cadence pausing on dominant harmony ${toChordSymbol}.`,
    };
  }

  // 5. Plagal Cadence: IV -> I (root motion up 7 semitones / down 5 semitones)
  if (isFromSubdominant(fromChord.triad) && isToMajor && rootDiff === 7) {
    return {
      cadenceType: "plagal",
      status: "supported",
      fromEventId,
      toEventId,
      metricStrength: 65,
      harmonicStrength: 70,
      explanation: `Plagal cadence from subdominant ${fromChordSymbol} to tonic ${toChordSymbol}.`,
    };
  }

  return null;
}

function isToDominantEnding(toStr: string): boolean {
  return toStr.endsWith("7") && !toStr.includes("maj");
}

function isFromSubdominant(triad: string): boolean {
  return triad === "major" || triad === "minor";
}
