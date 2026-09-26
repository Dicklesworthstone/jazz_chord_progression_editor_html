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

  test("approach chords are spelled by interval from the target's letter", () => {
    /* Hand-authored: ii is a major second above the target, V a perfect
     * fifth, the chromatic neighbour a minor second — so E's ii is F♯m7,
     * never G♭m7, whatever accidental the surrounding key prefers. */
    const cases: readonly (readonly [string, string, string, string])[] = [
      ["E7#9", "F#m7", "B7", "F7"],
      ["Db7", "Ebm7", "Ab7", "Ebb7"],
      ["A7", "Bm7", "E7", "Bb7"],
      ["Bbmaj7", "Cm7", "F7", "Cb7"],
    ];
    for (const [target, two, five, neighbour] of cases) {
      /* Any provider may hold the claim (dedupe keeps the earlier one); the
       * spelling must be letter-true whichever provider offers it. */
      const approaches = derive([target]).suggestions.map((entry) => entry.symbolText);
      expect(approaches).toContain(two);
      expect(approaches).toContain(five);
      /* Beyond one accidental the key-table name is kept (E𝄫7 → D7); a
       * single-flat C♭7 above B♭ is already letter-true and stays. */
      const expectedNeighbour = neighbour === "Ebb7" ? "D7" : neighbour;
      expect(approaches).toContain(expectedNeighbour);
    }
  });

  test("an enharmonic key is read in the spelling the chart itself uses", () => {
    /* Hand-authored: F#maj7 (F#, A#, C#, E#) sits wholly in F# major and in no
     * spelling of Gb major, so its first diatonic neighbours (the provider
     * offers two) are C#7 and G#m7; the Gbmaj7 control keeps Db7 and Abm7. */
    const sharp = derive(["F#maj7"]);
    expect(sharp.contextReading?.keyName).toBe("F#");
    const sharpNext = sharp.suggestions.filter((entry) => entry.explanation.providerId === "diatonic-next").map((entry) => entry.symbolText);
    expect(sharpNext).toEqual(["C#7", "G#m7"]);
    const flat = derive(["Gbmaj7"]);
    expect(flat.contextReading?.keyName).toBe("Gb");
    const flatNext = flat.suggestions.filter((entry) => entry.explanation.providerId === "diatonic-next").map((entry) => entry.symbolText);
    expect(flatNext).toEqual(["Db7", "Abm7"]);
  });

  test("a minor ii–V or a minor-coloured dominant leads with the minor home", () => {
    /* Hand-authored: in every key, iiø7 V7 (the ii a fifth above V) and a
     * lone V7♭9 put the minor tonic first and keep the major one second. */
    const roots = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    const fifthAbove = ["G", "Ab", "A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#"];
    const secondAbove = ["D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B", "C", "C#"];
    roots.forEach((tonic, index) => {
      const five = fifthAbove[index] ?? "", two = secondAbove[index] ?? "";
      for (const context of [[`${two}m7b5`, `${five}7`], [`${five}7b9`]]) {
        const homes = derive(context).suggestions
          .filter((entry) => entry.explanation.providerId === "dominant-resolution")
          .map((entry) => entry.symbolText);
        expect([context.join(" "), homes]).toEqual([context.join(" "), [`${tonic}m7`, `${tonic}maj7`]]);
      }
    });
    const minorTwoFive = derive(["Dm7b5", "G7"]).suggestions[0];
    expect(minorTwoFive?.explanation.sentence).toContain("Dm7b5 G7 is a minor ii–V");
  });

  test("near misses keep the major home first", () => {
    /* A minor-seventh ii, a half-diminished chord that is not the ii of
     * this V, and a ♯9 (which also colours major blues) all stay major-first. */
    for (const context of [["Dm7", "G7"], ["Em7b5", "G7"], ["G7#9"], ["Bm7b5", "G7"]]) {
      const homes = derive(context).suggestions
        .filter((entry) => entry.explanation.providerId === "dominant-resolution")
        .map((entry) => entry.symbolText);
      expect([context.join(" "), homes[0]?.endsWith("maj7")]).toEqual([context.join(" "), true]);
    }
  });

  test("a secondary dominant of ii, iii or vi leads with that diatonic minor chord", () => {
    /* Hand-authored, all twelve keys: Imaj7 VI7 → ii (A7 → Dm7 in C),
     * Imaj7 III7 → vi, Imaj7 VII7 → iii; the major home stays second. */
    const rows: readonly (readonly [string, string, string, string])[] = [
      ["C", "A7", "E7", "B7"], ["Db", "Bb7", "F7", "C7"], ["D", "B7", "F#7", "C#7"],
      ["Eb", "C7", "G7", "D7"], ["E", "C#7", "G#7", "D#7"], ["F", "D7", "A7", "E7"],
      ["F#", "D#7", "A#7", "E#7"], ["G", "E7", "B7", "F#7"], ["Ab", "F7", "C7", "G7"],
      ["A", "F#7", "C#7", "G#7"], ["Bb", "G7", "D7", "A7"], ["B", "G#7", "D#7", "A#7"],
    ];
    const targets: Readonly<Record<string, string>> = {
      A7: "D", E7: "A", B7: "E", Bb7: "Eb", F7: "Bb", C7: "F", "F#7": "B", "C#7": "F#",
      G7: "C", D7: "G", "G#7": "C#", "D#7": "G#", "A#7": "D#", "E#7": "A#",
    };
    for (const [tonic, ...dominants] of rows) {
      for (const dominant of dominants) {
        const target = targets[dominant] ?? "";
        const homes = derive([`${tonic}maj7`, dominant]).suggestions
          .filter((entry) => entry.explanation.providerId === "dominant-resolution")
          .map((entry) => entry.symbolText);
        expect([`${tonic}maj7 ${dominant}`, homes]).toEqual([`${tonic}maj7 ${dominant}`, [`${target}m7`, `${target}maj7`]]);
      }
    }
    expect(derive(["Cmaj7", "A7"]).suggestions[0]?.explanation.sentence).toContain("the ii of C major");
    /* Near-miss: V7/V and a non-diatonic target keep the major home first. */
    expect(derive(["Cmaj7", "D7"]).suggestions[0]?.symbolText).toBe("Gmaj7");
    expect(derive(["Fmaj7", "Bb7"]).suggestions[0]?.symbolText).toBe("Ebmaj7");
  });

  test("a tied key reading goes to the major tonic the passage opens on", () => {
    /* Hand-authored: Fmaj7 D7 fits F and C major equally (only F♯ is
     * outside either); opening on Fmaj7 makes F the reading. A dominant
     * opening does not claim the key. */
    expect(derive(["Fmaj7", "D7"]).contextReading?.keyName).toBe("F");
    expect(derive(["Fmaj7", "D7"]).contextReading?.tiedMajorKeys.map((key) => key.name)).toContain("C");
    expect(derive(["F7", "D7"]).contextReading?.keyName).not.toBe("F");
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
