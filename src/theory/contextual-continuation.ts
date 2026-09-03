import {
  type BeatValue,
  type ChordEventId,
  addBeatValues,
  parseStableId,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type ContinuationCandidate,
  type ContinuationCategory,
  type ContinuationEditPlan,
  type ContinuationHarmonicProof,
  type ContinuationOptions,
  type ContinuationProviderId,
  type ContinuationResult,
  G2_CONTINUATION_RESULT_SCHEMA,
  MAX_G2_CONTEXT_EVENTS,
  MAX_G2_DISPLAY_OPTIONS,
} from "./continuation-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

export function generateContextualContinuations(
  events: readonly {
    eventId: ChordEventId;
    chordSymbol: string;
    offsetBeat: BeatValue;
    duration: BeatValue;
  }[],
  options?: ContinuationOptions,
): ContinuationResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g2.empty_context",
        message: "Progression context is empty",
      },
    };
  }

  if (events.length > MAX_G2_CONTEXT_EVENTS) {
    return {
      ok: false,
      refusal: {
        code: "g2.context_exceeded",
        message: `Context length ${String(events.length)} exceeds maximum of ${String(MAX_G2_CONTEXT_EVENTS)} events`,
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const parsedChords = [];

  for (const ev of events) {
    const parsed = parseChordSymbol(ev.chordSymbol, accidentalStyle);
    if (!parsed.ok) {
      return {
        ok: false,
        refusal: {
          code: "g2.invalid_chord",
          message: `Invalid chord symbol in context: ${ev.chordSymbol}`,
          eventId: ev.eventId,
        },
      };
    }
    parsedChords.push({ ...ev, parsed: parsed.chord });
  }

  const lastEvent = parsedChords[parsedChords.length - 1];
  if (!lastEvent) {
    return {
      ok: false,
      refusal: {
        code: "g2.empty_context",
        message: "Last event not found",
      },
    };
  }

  const lastChord = lastEvent.parsed;
  const lastRoot = lastChord.root;
  const lastRootStr = spelledPitchClassToString(lastRoot);
  const addRes = addBeatValues(lastEvent.offsetBeat, lastEvent.duration);
  const nextOffset = addRes.ok ? addRes.value : lastEvent.offsetBeat;
  const nextDuration = options?.defaultDuration ?? lastEvent.duration;
  const nextEventId = eventIdOf(`continuation_after_${lastEvent.eventId}`);

  const candidates: ContinuationCandidate[] = [];
  let workSteps = 0;

  const isDominant =
    (lastChord.triad === "major" || lastChord.triad === "sus4") && lastChord.seventh === "minor";
  const isMinor = lastChord.triad === "minor";
  const isMajor = lastChord.triad === "major" && (lastChord.seventh === "major" || lastChord.seventh === null);

  // Helper to add candidate
  function addCandidate(
    providerId: ContinuationProviderId,
    category: ContinuationCategory,
    chordSymbol: string,
    proof: ContinuationHarmonicProof,
  ): void {
    workSteps++;
    const editPlan: ContinuationEditPlan = {
      targetEventId: nextEventId,
      insertedChordSymbol: chordSymbol,
      offsetBeat: nextOffset,
      duration: nextDuration,
    };
    candidates.push({
      candidateId: `cand_${providerId}_${chordSymbol}_${String(candidates.length)}`,
      providerId,
      category,
      chordSymbol,
      editPlan,
      proof,
      rank: candidates.length + 1,
    });
  }

  // 1. Circle Cadence / Functional Provider
  if (isDominant) {
    // Dominant resolves down a 5th (up a 4th) to major or minor
    const targetRoot = transposeSpelledPitchClass(lastRoot, 3, 5);
    const targetRootStr = spelledPitchClassToString(targetRoot);

    addCandidate("provider.functional.circle-cadence", "functional", `${targetRootStr}maj7`, {
      voiceLeadingScore: 95,
      tensionDelta: -3,
      preservedGuideTones: true,
      expectedMotion: "cycle-fifth",
      whyExplanation: `${lastEvent.chordSymbol} is a dominant seventh resolving down a fifth to major tonic ${targetRootStr}maj7.`,
    });

    addCandidate("provider.functional.circle-cadence", "functional", `${targetRootStr}m7`, {
      voiceLeadingScore: 90,
      tensionDelta: -2,
      preservedGuideTones: true,
      expectedMotion: "cycle-fifth",
      whyExplanation: `${lastEvent.chordSymbol} is a dominant seventh resolving down a fifth to minor tonic ${targetRootStr}m7.`,
    });
  } else if (isMajor) {
    // Major tonic moving to turnaround VI7 or ii
    const viRoot = transposeSpelledPitchClass(lastRoot, 5, 9);
    const viRootStr = spelledPitchClassToString(viRoot);
    addCandidate("provider.functional.circle-cadence", "functional", `${viRootStr}7`, {
      voiceLeadingScore: 85,
      tensionDelta: 2,
      preservedGuideTones: false,
      expectedMotion: "stepwise",
      whyExplanation: `Tonic ${lastEvent.chordSymbol} moves to secondary dominant ${viRootStr}7 initiating turnaround.`,
    });
  }

  // 2. Chromatic / Tritone Approach Provider
  if (isDominant) {
    const tritoneRoot = transposeSpelledPitchClass(lastRoot, 4, 6);
    const tritoneRootStr = spelledPitchClassToString(tritoneRoot);
    addCandidate("provider.chromatic.tritone-approach", "colorful", `${tritoneRootStr}maj7`, {
      voiceLeadingScore: 88,
      tensionDelta: -1,
      preservedGuideTones: true,
      expectedMotion: "chromatic",
      whyExplanation: `Tritone substitution resolution from ${lastEvent.chordSymbol} to ${tritoneRootStr}maj7.`,
    });

    const halfStepUpRoot = transposeSpelledPitchClass(lastRoot, 1, 1);
    const halfStepUpStr = spelledPitchClassToString(halfStepUpRoot);
    addCandidate("provider.chromatic.tritone-approach", "colorful", `${halfStepUpStr}maj7`, {
      voiceLeadingScore: 84,
      tensionDelta: -1,
      preservedGuideTones: true,
      expectedMotion: "chromatic",
      whyExplanation: `Chromatic side-slip resolution from ${lastEvent.chordSymbol} to ${halfStepUpStr}maj7.`,
    });
  }

  // 3. Diminished Passing Provider
  if (isMajor) {
    const sharpOneRoot = transposeSpelledPitchClass(lastRoot, 0, 1);
    const sharpOneStr = spelledPitchClassToString(sharpOneRoot);
    addCandidate("provider.diminished.passing", "colorful", `${sharpOneStr}dim7`, {
      voiceLeadingScore: 92,
      tensionDelta: 2,
      preservedGuideTones: false,
      expectedMotion: "chromatic",
      whyExplanation: `Ascending passing diminished ${sharpOneStr}dim7 connects tonic ${lastEvent.chordSymbol} smoothly to upcoming ii chord.`,
    });
  }

  // 4. Minor Line Cliché Provider
  if (isMinor) {
    addCandidate("provider.line-cliche.minor-step", "smooth", `${lastRootStr}m(maj7)`, {
      voiceLeadingScore: 98,
      tensionDelta: 1,
      preservedGuideTones: true,
      expectedMotion: "common-tone",
      whyExplanation: `Opens minor line cliché moving 7th chromatically upward within ${lastEvent.chordSymbol}.`,
    });
  }

  // 5. Modal Step Vamp Provider
  if (isMinor) {
    const wholeStepRoot = transposeSpelledPitchClass(lastRoot, 1, 2);
    const wholeStepStr = spelledPitchClassToString(wholeStepRoot);
    addCandidate("provider.modal.step-vamp", "exploratory", `${wholeStepStr}m7`, {
      voiceLeadingScore: 86,
      tensionDelta: 0,
      preservedGuideTones: false,
      expectedMotion: "stepwise",
      whyExplanation: `Modal Dorian vamp stepping up a whole step from ${lastEvent.chordSymbol} to ${wholeStepStr}m7.`,
    });

    const halfStepRoot = transposeSpelledPitchClass(lastRoot, 1, 1);
    const halfStepStr = spelledPitchClassToString(halfStepRoot);
    addCandidate("provider.modal.step-vamp", "exploratory", `${halfStepStr}m7`, {
      voiceLeadingScore: 82,
      tensionDelta: 1,
      preservedGuideTones: false,
      expectedMotion: "stepwise",
      whyExplanation: `Modal shift stepping up a half step from ${lastEvent.chordSymbol} to ${halfStepStr}m7.`,
    });
  }

  // Filter by category if requested
  let filtered = candidates;
  if (options?.categoryFilter) {
    filtered = filtered.filter((c) => c.category === options.categoryFilter);
  }

  // Deduplicate by inserted chord symbol
  const seenSymbols = new Set<string>();
  const deduped: ContinuationCandidate[] = [];
  for (const c of filtered) {
    if (seenSymbols.has(c.chordSymbol)) continue;
    seenSymbols.add(c.chordSymbol);
    deduped.push(c);
  }

  const maxDisplay = Math.min(options?.maxDisplayOptions ?? 16, MAX_G2_DISPLAY_OPTIONS);
  const displayCandidates = deduped.slice(0, maxDisplay);

  return {
    ok: true,
    schema: G2_CONTINUATION_RESULT_SCHEMA,
    candidates: displayCandidates,
    workSteps,
  };
}
