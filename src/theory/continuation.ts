import { pitchClassOf, type ChordDegree, type PitchClass, type SpelledPitchClass } from "../domain";

import {
  CONTINUATION_ENGINE_VERSION,
  CONTINUATION_PROVIDER_IDS,
  MAX_CONTINUATION_CONTEXT_EVENTS,
  MAX_CONTINUATION_PER_PROVIDER,
  MAX_CONTINUATION_SUGGESTIONS,
  type ContinuationRequest,
  type ContinuationContextBarrier,
  type ContinuationContextReading,
  type ContinuationContextTone,
  type ContinuationSuggestion,
  type LegacyContinuationCategory,
  type LegacyContinuationProviderId,
  type LegacyContinuationResult as ContinuationResult,
} from "./continuation-contract";
import type { ResolutionOperations } from "./resolution-contract";

/**
 * Bounded, deterministic next-chord derivation from literal chord facts.
 *
 * Pure by construction: the only inputs are the request's exact chord specs
 * and the injected T1 resolution oracle (the V2 idiom — theory receives its
 * collaborators, it never imports application or content). Same request and
 * oracle, same bytes out, always: providers run in the frozen order, every
 * ranking tie-break is total, and the work counters report a closed
 * `complete` termination because the search space is a handful of table
 * lookups, never an open search.
 */

/** Flat-preferred pitch names; sharps used only under a sharp-key reading. */
const FLAT_NAMES = Object.freeze([
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
] as const);
const SHARP_NAMES = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const);

/** The five sharp-side major keys; every other key spells with flats. */
const SHARP_KEYS: ReadonlySet<number> = new Set([7, 2, 9, 4, 11]);

const MAJOR_SCALE_STEPS = Object.freeze([0, 2, 4, 5, 7, 9, 11] as const);

const CATEGORY_ORDER: Readonly<Record<LegacyContinuationCategory, number>> =
  Object.freeze({
    "resolve": 0,
    "continue-pattern": 1,
    "approach-target": 2,
    "increase-color": 3,
    "explore": 4,
  });

type ContextFacts = Readonly<{
  symbolText: string;
  rootPc: PitchClass;
  isDominant: boolean;
  pitchClasses: readonly PitchClass[];
  contextIndex: number;
  realizationId: string;
  degrees: readonly ChordDegree[];
  spellings: readonly SpelledPitchClass[];
}>;

type Candidate = Readonly<{
  providerId: LegacyContinuationProviderId;
  providerIndex: number;
  /** Emission order inside the provider: an informed ordering, kept stable. */
  emissionIndex: number;
  symbolText: string;
  category: LegacyContinuationCategory;
  sentence: string;
  sourceSymbols: readonly string[];
}>;

function pc(value: number): number {
  return ((value % 12) + 12) % 12;
}

function nameFor(pitchClass: number, keyPc: number): string {
  const table = SHARP_KEYS.has(pc(keyPc)) ? SHARP_NAMES : FLAT_NAMES;
  return table[pc(pitchClass)] ?? "C";
}

const KEY_PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MAJOR_TONICS: readonly SpelledPitchClass[] = Object.freeze([
  { step: "C", alter: 0 }, { step: "D", alter: -1 }, { step: "D", alter: 0 },
  { step: "E", alter: -1 }, { step: "E", alter: 0 }, { step: "F", alter: 0 },
  { step: "G", alter: -1 }, { step: "G", alter: 0 }, { step: "A", alter: -1 },
  { step: "A", alter: 0 }, { step: "B", alter: -1 }, { step: "B", alter: 0 },
]);
const SCALE_DEGREES = [1, 2, 3, 4, 5, 6, 7] as const;
function written(pitch: SpelledPitchClass): string {
  return `${pitch.step}${pitch.alter < 0 ? "b".repeat(-pitch.alter) : "#".repeat(pitch.alter)}`;
}

function contextFacts(request: ContinuationRequest, operations: ResolutionOperations) {
  const offset = Math.max(0, request.context.length - MAX_CONTINUATION_CONTEXT_EVENTS);
  const window = request.context.slice(offset);
  const facts: ContextFacts[] = [], barriers: ContinuationContextBarrier[] = [];
  const invalidSelectionShape = request.selectedRealizationIds !== undefined && request.selectedRealizationIds.length !== request.context.length;
  window.forEach((spec, index) => {
    const contextIndex = offset + index;
    const barrier = (reason: ContinuationContextBarrier["reason"]): void => {
      facts.length = 0; // A later suffix remains usable; never join across the barrier.
      barriers.push(Object.freeze({ contextIndex, sourceSymbol: spec.sourceText, reason }));
    };
    if (spec.kind === "custom") { barrier("custom-chord"); return; }
    if (invalidSelectionShape) { barrier("invalid-selection"); return; }
    const resolved = operations.resolveChord(spec);
    if (!resolved.ok) { barrier("unsupported-chord"); return; }
    const selected = request.selectedRealizationIds?.[contextIndex] ?? null;
    if (selected === null && resolved.value.realizations.length > 1) { barrier("selected-realization-required"); return; }
    const realization = selected === null ? resolved.value.realizations[0] : resolved.value.realizations.find(row => row.id === selected);
    if (realization === undefined) { barrier("invalid-selection"); return; }
    facts.push(Object.freeze({
      symbolText: spec.sourceText, rootPc: pitchClassOf(spec.root),
      isDominant: spec.triad === "major" && spec.seventh === "minor",
      contextIndex, realizationId: realization.id,
      pitchClasses: Object.freeze([...realization.pitchClasses]),
      degrees: Object.freeze(realization.degrees.map(degree => Object.freeze({ ...degree }))),
      spellings: Object.freeze(realization.spelledPitchNames.map(spelling => Object.freeze({ ...spelling }))),
    }));
  });
  return { facts, barriers: Object.freeze(barriers), examined: window.length };
}

function readMajorContext(facts: readonly ContextFacts[], operations: ResolutionOperations):
  Readonly<{ reading: ContinuationContextReading | null; comparisons: number }> {
  const last = facts[facts.length - 1];
  if (last === undefined) return { reading: null, comparisons: 0 };
  let comparisons = 0;
  const scores = KEY_PITCH_CLASSES.map(key => {
    const scale = new Set(MAJOR_SCALE_STEPS.map(step => pc(key + step)));
    let score = 0;
    for (const fact of facts) for (const pitch of fact.pitchClasses) {
      comparisons += 1;
      if (scale.has(pitch)) score += 1;
    }
    return { key, score };
  });
  const maximum = Math.max(...scores.map(row => row.score));
  const tied = scores.filter(row => row.score === maximum);
  // Preserve the existing candidate preference, but retain every tied hypothesis.
  const chosen = tied.find(row => row.key === last.rootPc) ?? tied[0];
  if (chosen === undefined) return { reading: null, comparisons };
  const keyPc = chosen.key, root = MAJOR_TONICS[keyPc];
  if (root === undefined) return { reading: null, comparisons };
  const scaleSpellings = SCALE_DEGREES.map(number => operations.spellChordDegree(root, { number, alter: 0 }));
  if (scaleSpellings.some(result => !result.ok)) return { reading: null, comparisons };
  const names = new Set(scaleSpellings.flatMap(result => result.ok ? [written(result.value.spelled)] : []));
  const scale = new Set(MAJOR_SCALE_STEPS.map(step => pc(keyPc + step)));
  const tones: ContinuationContextTone[] = [];
  for (const fact of facts) fact.pitchClasses.forEach((pitchClass, index) => {
    const spelling = fact.spellings[index], degree = fact.degrees[index];
    if (spelling === undefined || degree === undefined) return;
    tones.push(Object.freeze({ contextIndex: fact.contextIndex, sourceSymbol: fact.symbolText,
      realizationId: fact.realizationId, spelling, degree, pitchClass,
      pitchClassContained: scale.has(pitchClass), spellingContained: names.has(written(spelling)) }));
  });
  const pitchClassMatches = tones.filter(tone => tone.pitchClassContained).length;
  const spellingMatches = tones.filter(tone => tone.spellingContained).length;
  return Object.freeze({ comparisons, reading: Object.freeze({
    policy: "major-pitch-overlap@1", keyName: nameFor(keyPc, keyPc), keyPitchClass: keyPc,
    tiedMajorKeys: Object.freeze(tied.map(row => Object.freeze({ name: nameFor(row.key, row.key), pitchClass: row.key }))),
    toneOccurrences: tones.length, pitchClassMatches, spellingMatches,
    completePitchClassContainment: pitchClassMatches === tones.length,
    completeSpelledContainment: spellingMatches === tones.length,
    outsideSpellings: Object.freeze([...new Set(tones.filter(tone => !tone.pitchClassContained).map(tone => written(tone.spelling)))]),
    enharmonicSpellings: Object.freeze([...new Set(tones.filter(tone => tone.pitchClassContained && !tone.spellingContained).map(tone => written(tone.spelling)))]),
    tones: Object.freeze(tones), keyDeclared: false,
  }) });
}

function contextSentence(reading: ContinuationContextReading): string {
  const otherKeys = reading.tiedMajorKeys.filter(key => key.pitchClass !== reading.keyPitchClass).map(key => `${key.name} major`);
  return `${reading.keyName} major is one possible reading: ${String(reading.pitchClassMatches)} of ${String(reading.toneOccurrences)} chord tones match by pitch class; ${String(reading.spellingMatches)} match the scale's spelling.`
    + (reading.outsideSpellings.length > 0 ? ` Outside it: ${reading.outsideSpellings.join(", ")}.` : "")
    + (reading.enharmonicSpellings.length > 0 ? ` Different spellings: ${reading.enharmonicSpellings.join(", ")}.` : "")
    + (otherKeys.length > 0 ? ` ${otherKeys.join(", ")} ${otherKeys.length === 1 ? "ties" : "tie"} on pitch-class overlap.` : "");
}

export function deriveContinuationSuggestions(
  request: ContinuationRequest,
  operations: ResolutionOperations,
): ContinuationResult {
  const captured = contextFacts(request, operations);
  const facts = captured.facts;
  const majorContext = readMajorContext(facts, operations);
  const last = facts[facts.length - 1];

  const candidates: Candidate[] = [];
  let providersRun = 0;
  const providerIndex = (id: LegacyContinuationProviderId): number =>
    CONTINUATION_PROVIDER_IDS.indexOf(id);
  const emit = (
    providerId: LegacyContinuationProviderId,
    symbolText: string,
    category: LegacyContinuationCategory,
    sentence: string,
    sourceSymbols: readonly string[],
  ): void => {
    const emitted = candidates.filter(
      (candidate) => candidate.providerId === providerId,
    ).length;
    if (emitted >= MAX_CONTINUATION_PER_PROVIDER) return;
    candidates.push(
      Object.freeze({
        providerId,
        providerIndex: providerIndex(providerId),
        emissionIndex: emitted,
        symbolText,
        category,
        sentence,
        sourceSymbols: Object.freeze([...sourceSymbols]),
      }),
    );
  };

  if (last !== undefined && majorContext.reading !== null) {
    const keyPc = majorContext.reading.keyPitchClass;
    const keyName = majorContext.reading.keyName;
    const contextRootPcs = new Set(facts.map((fact) => pc(fact.rootPc)));

    // dominant-resolution: a dominant tends down a fifth; offer both homes.
    providersRun += 1;
    if (last.isDominant) {
      const targetPc = pc(last.rootPc + 5);
      const target = nameFor(targetPc, keyPc);
      emit(
        "dominant-resolution",
        `${target}maj7`,
        "resolve",
        `${last.symbolText} is a dominant seventh, and dominants tend to fall a fifth: ${target}maj7 receives it as a major home.`,
        [last.symbolText],
      );
      emit(
        "dominant-resolution",
        `${target}m7`,
        "resolve",
        `${last.symbolText} is a dominant seventh, and dominants tend to fall a fifth: ${target}m7 receives it as a minor home.`,
        [last.symbolText],
      );
    }

    // turnaround: continue an in-flight I–vi(–ii) chain toward its V.
    providersRun += 1;
    if (facts.length >= 2) {
      const roots = facts.map((fact) => pc(fact.rootPc));
      const tail2 = roots.slice(-2);
      const tail3 = roots.slice(-3);
      const symbols = facts.map((fact) => fact.symbolText);
      if (
        tail3.length === 3 &&
        tail3[1] === pc((tail3[0] ?? 0) + 9) &&
        tail3[2] === pc((tail3[0] ?? 0) + 2)
      ) {
        const five = nameFor(pc((tail3[0] ?? 0) + 7), keyPc);
        emit(
          "turnaround",
          `${five}7`,
          "continue-pattern",
          `${symbols.slice(-3).join(", ")} walk the I–vi–ii turnaround: ${five}7 is the V that completes the cycle.`,
          symbols.slice(-3),
        );
      } else if (tail2.length === 2 && tail2[1] === pc((tail2[0] ?? 0) + 9)) {
        const two = nameFor(pc((tail2[0] ?? 0) + 2), keyPc);
        emit(
          "turnaround",
          `${two}m7`,
          "continue-pattern",
          `${symbols.slice(-2).join(" then ")} open the I–vi turnaround: ${two}m7 continues the chain toward its V.`,
          symbols.slice(-2),
        );
      }
    }

    // diatonic-next: neighbors inside the voted key not already sounded.
    providersRun += 1;
    {
      const diatonicOrder: readonly (readonly [number, string])[] = [
        [pc(keyPc + 7), "7"],
        [pc(keyPc + 2), "m7"],
        [pc(keyPc + 9), "m7"],
        [pc(keyPc + 5), "maj7"],
        [keyPc, "maj7"],
        [pc(keyPc + 4), "m7"],
      ];
      for (const [rootPc, quality] of diatonicOrder) {
        if (contextRootPcs.has(rootPc)) continue;
        const name = nameFor(rootPc, keyPc);
        emit(
          "diatonic-next",
          `${name}${quality}`,
          "continue-pattern",
          `${contextSentence(majorContext.reading)} ${name}${quality} is available under this reading.`,
          facts.map((fact) => fact.symbolText),
        );
      }
    }

    // two-five-approach: set up a return to the last chord.
    providersRun += 1;
    {
      const fivePc = pc(last.rootPc + 7);
      const twoPc = pc(last.rootPc + 2);
      const five = nameFor(fivePc, keyPc);
      const two = nameFor(twoPc, keyPc);
      emit(
        "two-five-approach",
        `${five}7`,
        "approach-target",
        `${five}7 is the dominant a fifth above ${last.symbolText}: playing it sets up a pull back toward ${last.symbolText}.`,
        [last.symbolText],
      );
      emit(
        "two-five-approach",
        `${two}m7`,
        "approach-target",
        `${two}m7 is the ii of ${last.symbolText}: it opens a ii–V that can circle back to where you are.`,
        [last.symbolText],
      );
    }

    // tritone-approach: the chromatic upper-neighbor dominant.
    providersRun += 1;
    {
      const halfUpPc = pc(last.rootPc + 1);
      const halfUp = nameFor(halfUpPc, keyPc);
      emit(
        "tritone-approach",
        `${halfUp}7`,
        "increase-color",
        `${halfUp}7 sits a half step above ${last.symbolText} and shares a tritone with its dominant: a chromatic slide that darkens the color.`,
        [last.symbolText],
      );
    }

    // backdoor: bVII7 of the voted tonic.
    providersRun += 1;
    {
      const backdoorPc = pc(keyPc + 10);
      const backdoor = nameFor(backdoorPc, keyPc);
      emit(
        "backdoor",
        `${backdoor}7`,
        "increase-color",
        `${backdoor}7 is the backdoor dominant of ${keyName}: it reaches the tonic from a whole step below without the leading tone.`,
        facts.map((fact) => fact.symbolText),
      );
    }
  }

  // Canonical dedupe by symbol text: the earlier provider keeps the claim.
  let dedupeComparisons = 0;
  const seen = new Set<string>();
  const deduped: Candidate[] = [];
  for (const candidate of candidates) {
    dedupeComparisons += 1;
    if (seen.has(candidate.symbolText)) continue;
    seen.add(candidate.symbolText);
    deduped.push(candidate);
  }

  deduped.sort((left, right) => {
    const category =
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (category !== 0) return category;
    if (left.providerIndex !== right.providerIndex) {
      return left.providerIndex - right.providerIndex;
    }
    if (left.emissionIndex !== right.emissionIndex) {
      return left.emissionIndex - right.emissionIndex;
    }
    return left.symbolText < right.symbolText
      ? -1
      : left.symbolText > right.symbolText
        ? 1
        : 0;
  });

  const suggestions: ContinuationSuggestion[] = deduped
    .slice(0, MAX_CONTINUATION_SUGGESTIONS)
    .map((candidate) =>
      Object.freeze({
        id: `${candidate.providerId}:${candidate.symbolText}`,
        symbolText: candidate.symbolText,
        category: candidate.category,
        explanation: Object.freeze({
          providerId: candidate.providerId,
          sentence: candidate.sentence,
          sourceSymbols: candidate.sourceSymbols,
        }),
      }),
    );

  return Object.freeze({
    engineVersion: CONTINUATION_ENGINE_VERSION,
    suggestions: Object.freeze(suggestions),
    contextReading: majorContext.reading,
    contextBarriers: captured.barriers,
    evidence: Object.freeze({
      contextEventsExamined: captured.examined,
      providersRun,
      candidatesEmitted: candidates.length,
      dedupeComparisons,
      majorKeyToneComparisons: majorContext.comparisons,
      termination: "complete" as const,
    }),
  });
}
