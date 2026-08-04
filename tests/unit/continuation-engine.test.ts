/**
 * Independent fixtures for the session continuation engine. Every expected
 * suggestion below is hand-authored from the named law — never read back
 * from the engine — so the engine cannot certify itself.
 */
import { describe, expect, test } from "bun:test";

import type { ChordSpec } from "../../src/domain";
import {
  CONTINUATION_PROVIDER_IDS,
  MAX_CONTINUATION_PER_PROVIDER,
  MAX_CONTINUATION_SUGGESTIONS,
  deriveContinuationSuggestions,
  parseChordSymbol,
  resolutionOperations,
} from "../../src/theory";

function mustParse(sourceText: string): ChordSpec {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`test symbol did not parse: ${sourceText}`);
  return parsed.chord;
}

function derive(symbols: readonly string[]) {
  return deriveContinuationSuggestions(
    { context: symbols.map(mustParse) },
    resolutionOperations,
  );
}

describe("the session continuation engine", () => {
  test("after Dm7 G7 the first option resolves G7 to Cmaj7 and says why", () => {
    const result = derive(["Dm7", "G7"]);
    const first = result.suggestions[0];
    if (first === undefined) throw new Error("no suggestions emitted");
    expect(first.symbolText).toBe("Cmaj7");
    expect(first.category).toBe("resolve");
    expect(first.explanation.providerId).toBe("dominant-resolution");
    expect(first.explanation.sentence).toContain("G7");
    expect(first.explanation.sourceSymbols).toEqual(["G7"]);
    // The minor home is offered as a peer, never a replacement verdict.
    const symbols = result.suggestions.map((entry) => entry.symbolText);
    expect(symbols).toContain("Cm7");
  });

  test("a maj7 final chord never produces a dominant-resolution option", () => {
    const result = derive(["Dm7", "G7", "Cmaj7"]);
    const providers = result.suggestions.map(
      (entry) => entry.explanation.providerId,
    );
    expect(providers).not.toContain("dominant-resolution");
  });

  test("I–vi continues toward its ii; I–vi–ii continues toward its V", () => {
    const twoChord = derive(["Cmaj7", "Am7"]);
    const twoChordTexts = twoChord.suggestions
      .filter((entry) => entry.explanation.providerId === "turnaround")
      .map((entry) => entry.symbolText);
    expect(twoChordTexts).toEqual(["Dm7"]);

    const threeChord = derive(["Cmaj7", "Am7", "Dm7"]);
    const threeChordTexts = threeChord.suggestions
      .filter((entry) => entry.explanation.providerId === "turnaround")
      .map((entry) => entry.symbolText);
    expect(threeChordTexts).toEqual(["G7"]);
  });

  test("identical requests produce byte-identical results", () => {
    const first = derive(["Fmaj7", "Bb7"]);
    const second = derive(["Fmaj7", "Bb7"]);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("bounds hold: total cap, per-provider cap, closed counters", () => {
    const result = derive(["Cmaj7", "Am7", "Dm7", "G7"]);
    expect(result.suggestions.length).toBeLessThanOrEqual(
      MAX_CONTINUATION_SUGGESTIONS,
    );
    for (const providerId of CONTINUATION_PROVIDER_IDS) {
      const emitted = result.suggestions.filter(
        (entry) => entry.explanation.providerId === providerId,
      ).length;
      expect(emitted).toBeLessThanOrEqual(MAX_CONTINUATION_PER_PROVIDER);
    }
    expect(result.evidence.termination).toBe("complete");
    expect(result.evidence.contextEventsExamined).toBe(4);
    expect(result.evidence.providersRun).toBe(6);
    expect(result.evidence.candidatesEmitted).toBeGreaterThan(0);
  });

  test("an empty context yields no options rather than an invented opening", () => {
    const result = derive([]);
    expect(result.suggestions).toEqual([]);
    expect(result.evidence.contextEventsExamined).toBe(0);
  });

  test("the context window examines at most the last four chords", () => {
    const result = derive(["Cmaj7", "Fmaj7", "Am7", "Dm7", "G7", "Em7"]);
    expect(result.evidence.contextEventsExamined).toBe(4);
  });

  test("no option is ever labeled best or correct", () => {
    const result = derive(["Dm7", "G7"]);
    for (const entry of result.suggestions) {
      expect(entry.explanation.sentence).not.toMatch(/\bbest\b|\bcorrect\b/i);
    }
  });

  test("every option id is its provider and symbol, deterministically", () => {
    const result = derive(["Dm7", "G7"]);
    for (const entry of result.suggestions) {
      expect(entry.id).toBe(
        `${entry.explanation.providerId}:${entry.symbolText}`,
      );
    }
    const ids = result.suggestions.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
