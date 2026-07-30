import { pitchClassOf, type ChordSpec, type PitchClass } from "../domain";

import {
  CONTINUATION_ENGINE_VERSION,
  CONTINUATION_PROVIDER_IDS,
  MAX_CONTINUATION_CONTEXT_EVENTS,
  MAX_CONTINUATION_PER_PROVIDER,
  MAX_CONTINUATION_SUGGESTIONS,
  type ContinuationCategory,
  type ContinuationProviderId,
  type ContinuationRequest,
  type ContinuationResult,
  type ContinuationSuggestion,
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

const CATEGORY_ORDER: Readonly<Record<ContinuationCategory, number>> =
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
  pitchClasses: readonly number[];
}>;

type Candidate = Readonly<{
  providerId: ContinuationProviderId;
  providerIndex: number;
  /** Emission order inside the provider: an informed ordering, kept stable. */
  emissionIndex: number;
  symbolText: string;
  category: ContinuationCategory;
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

function contextFacts(
  context: readonly ChordSpec[],
  operations: ResolutionOperations,
): readonly ContextFacts[] {
  return context.map((spec) => {
    const resolved = operations.resolveChord(spec);
    const pitchClasses = resolved.ok
      ? resolved.value.realizations[0].pitchClasses
      : [pitchClassOf(spec.root)];
    return Object.freeze({
      symbolText: spec.sourceText,
      rootPc: pitchClassOf(spec.root),
      isDominant: spec.triad === "major" && spec.seventh === "minor",
      pitchClasses: Object.freeze([...pitchClasses]),
    });
  });
}

/**
 * Majority-vote key evidence: the major key whose scale contains the most
 * context pitch classes. Ties break toward the last chord's root read as
 * tonic, then toward the lower pitch class — a frozen preference, not a
 * claim that the winning key is the true reading.
 */
function inferKeyPc(facts: readonly ContextFacts[]): number {
  const last = facts[facts.length - 1];
  if (last === undefined) return 0;
  let bestKey = pc(last.rootPc);
  let bestScore = -1;
  for (let key = 0; key < 12; key += 1) {
    const scale = new Set(MAJOR_SCALE_STEPS.map((step) => pc(key + step)));
    let score = 0;
    for (const fact of facts) {
      for (const heard of fact.pitchClasses) {
        if (scale.has(pc(heard))) score += 1;
      }
    }
    const tieBreakWins =
      score === bestScore && key === pc(last.rootPc) && bestKey !== key;
    if (score > bestScore || tieBreakWins) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}

export function deriveContinuationSuggestions(
  request: ContinuationRequest,
  operations: ResolutionOperations,
): ContinuationResult {
  const window = request.context.slice(-MAX_CONTINUATION_CONTEXT_EVENTS);
  const facts = contextFacts(window, operations);
  const last = facts[facts.length - 1];

  const candidates: Candidate[] = [];
  let providersRun = 0;
  const providerIndex = (id: ContinuationProviderId): number =>
    CONTINUATION_PROVIDER_IDS.indexOf(id);
  const emit = (
    providerId: ContinuationProviderId,
    symbolText: string,
    category: ContinuationCategory,
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

  if (last !== undefined) {
    const keyPc = inferKeyPc(facts);
    const keyName = nameFor(keyPc, keyPc);
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
          `The last ${String(facts.length)} chord${facts.length === 1 ? "" : "s"} sit inside ${keyName} major, and ${name}${quality} is diatonic to it: staying in the key continues the pattern.`,
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
    evidence: Object.freeze({
      contextEventsExamined: facts.length,
      providersRun,
      candidatesEmitted: candidates.length,
      dedupeComparisons,
      termination: "complete" as const,
    }),
  });
}
