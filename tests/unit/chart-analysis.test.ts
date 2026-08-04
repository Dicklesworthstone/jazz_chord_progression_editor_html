/**
 * Independent fixtures for the chart-annotation engine (V2R-6). Every
 * expected roman numeral, phrase span, guide-tone move, and next option
 * below is hand-authored from the named musical law — never read back from
 * the engine — so the engine cannot certify itself. Each detector carries
 * positive, negative/near-miss, and transposition cases per the
 * verification discipline.
 */
import { describe, expect, test } from "bun:test";

import type { ChordSpec, CustomChordSpec, KeyContext } from "../../src/domain";
import { makeSpelledPitchClass } from "../../src/domain";
import {
  CHART_ANALYSIS_ENGINE_VERSION,
  MAX_CHART_NEXT_OPTIONS,
  analyzeChartEvent,
  deriveChordDetail,
  detectChartPhrases,
  parseChordSymbol,
  resolutionOperations,
} from "../../src/theory";

function mustParse(sourceText: string): ChordSpec {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`test symbol did not parse: ${sourceText}`);
  return parsed.chord;
}

function keyOf(step: string, alter: number, mode: KeyContext["mode"]): KeyContext {
  const tonic = makeSpelledPitchClass({ step, alter });
  if (!tonic.ok) throw new Error(`test tonic did not construct: ${step}/${String(alter)}`);
  return Object.freeze({ tonic: tonic.value, mode });
}

const C_MAJOR = keyOf("C", 0, "major");
const E_FLAT_MAJOR = keyOf("E", -1, "major");
const F_MAJOR = keyOf("F", 0, "major");

function analyze(symbol: string, key: KeyContext | null) {
  return analyzeChartEvent(
    { current: mustParse(symbol), key },
    resolutionOperations,
  );
}

function phrases(symbols: readonly string[], key: KeyContext | null) {
  return detectChartPhrases({ events: symbols.map(mustParse), key });
}

function detail(
  symbol: string,
  nextSymbol: string | null,
  key: KeyContext | null,
) {
  return deriveChordDetail(
    {
      current: mustParse(symbol),
      next:
        nextSymbol === null
          ? null
          : { spec: mustParse(nextSymbol), symbolText: nextSymbol },
      key,
    },
    resolutionOperations,
  );
}

const CUSTOM_SPEC: CustomChordSpec = (() => {
  const pitch = (step: string, alter: number) => {
    const made = makeSpelledPitchClass({ step, alter });
    if (!made.ok) throw new Error(`custom pitch did not construct: ${step}`);
    return made.value;
  };
  // A hand-built custom spec: literal pitches, no formula, no degrees.
  return Object.freeze({
    kind: "custom",
    sourceText: "custom(C,E,G)",
    label: "cluster",
    pitchNames: [pitch("C", 0), pitch("E", 0), pitch("G", 0)] as const,
    bass: null,
  }) satisfies CustomChordSpec;
})();

describe("analyzeChartEvent — roman numerals and function", () => {
  test("the diatonic ii in C reads ii7, predominant, Dorian", () => {
    const result = analyze("Dm7", C_MAJOR);
    expect(result.outcome).toBe("analyzed");
    expect(result.kind).toBe("predominant");
    expect(result.roman).toBe("ii7");
    expect(result.functionSentence).toContain("Predominant");
    expect(result.scaleSentence).toBe("D Dorian");
  });

  test("the dominant V in C reads V7 and pulls home", () => {
    const result = analyze("G7", C_MAJOR);
    expect(result.kind).toBe("dominant");
    expect(result.roman).toBe("V7");
    expect(result.functionSentence).toContain("pulls home");
    expect(result.scaleSentence).toBe("G Mixolydian");
  });

  test("the tonic Imaj7 in C reads home, Ionian", () => {
    const result = analyze("Cmaj7", C_MAJOR);
    expect(result.kind).toBe("tonic");
    expect(result.roman).toBe("Imaj7");
    expect(result.functionSentence).toContain("home");
    expect(result.scaleSentence).toBe("C Ionian");
  });

  test("Db7 in C is the tritone substitute with Lydian dominant", () => {
    const result = analyze("Db7", C_MAJOR);
    expect(result.kind).toBe("dominant");
    expect(result.roman).toBe("♭II7");
    expect(result.functionSentence).toContain("Tritone substitute");
    expect(result.scaleSentence).toContain("Lydian dominant");
  });

  test("A7 in C is a secondary dominant naming its target", () => {
    const result = analyze("A7", C_MAJOR);
    expect(result.kind).toBe("dominant");
    expect(result.roman).toBe("VI7");
    expect(result.functionSentence).toContain("Secondary dominant");
    expect(result.functionSentence).toContain("ii");
  });

  test("an altered dominant is offered the altered scale", () => {
    const result = analyze("G7b9", C_MAJOR);
    expect(result.scaleSentence).toBe("G altered");
  });

  test("the half-diminished ii of a minor ii–V reads Locrian", () => {
    const result = analyze("Dm7b5", C_MAJOR);
    expect(result.kind).toBe("predominant");
    expect(result.functionSentence).toContain("Half-diminished");
    expect(result.scaleSentence).toBe("D Locrian");
  });

  test("transposition: the same ii7 reading follows the key to Eb", () => {
    const inC = analyze("Dm7", C_MAJOR);
    const inEb = analyze("Fm7", E_FLAT_MAJOR);
    expect(inEb.roman).toBe(inC.roman);
    expect(inEb.kind).toBe(inC.kind);
    expect(inEb.scaleSentence).toBe("F Dorian");
  });

  test("no key set: no roman or kind is claimed, only quality facts", () => {
    const result = analyze("G7", null);
    expect(result.outcome).toBe("unkeyed");
    expect(result.roman).toBeNull();
    expect(result.kind).toBeNull();
    /* The quality-only scale needs no key and stays offered. */
    expect(result.scaleSentence).toBe("G Mixolydian");
  });

  test("a custom chord is stated honestly with no invented analysis", () => {
    const result = analyzeChartEvent(
      { current: CUSTOM_SPEC, key: C_MAJOR },
      resolutionOperations,
    );
    expect(result.outcome).toBe("custom-chord");
    expect(result.roman).toBeNull();
    expect(result.kind).toBeNull();
    expect(result.scaleSentence).toBeNull();
  });

  test("every analysis names the engine version", () => {
    expect(analyze("Cmaj7", C_MAJOR).engineVersion).toBe(
      CHART_ANALYSIS_ENGINE_VERSION,
    );
  });
});

describe("detectChartPhrases — pencilled brackets", () => {
  test("Dm7 G7 Cmaj7 is one ii–V–I in C", () => {
    const result = phrases(["Dm7", "G7", "Cmaj7"], C_MAJOR);
    expect(result.phrases).toHaveLength(1);
    const span = result.phrases[0];
    expect(span?.kind).toBe("two-five-one");
    expect(span?.fromIndex).toBe(0);
    expect(span?.toIndex).toBe(2);
    expect(span?.label).toBe("ii–V–I in C");
  });

  test("the minor ii–V–i lands on the minor tonic and says so", () => {
    const result = phrases(["Dm7b5", "G7b9", "Cm7"], C_MAJOR);
    const span = result.phrases[0];
    expect(span?.kind).toBe("two-five-one");
    expect(span?.label).toBe("ii–V–I in C minor");
  });

  test("a bare ii–V names the key it points at", () => {
    const result = phrases(["Am7", "D7"], C_MAJOR);
    const span = result.phrases[0];
    expect(span?.kind).toBe("two-five");
    expect(span?.label).toBe("ii–V of G");
  });

  test("near miss: wrong root motion is NOT a ii–V", () => {
    /* Dm7 to A7 rises a fifth, not a fourth — no bracket. */
    const result = phrases(["Dm7", "A7"], C_MAJOR);
    expect(result.phrases).toHaveLength(0);
  });

  test("the I–vi–ii–V turnaround wins over its inner ii–V", () => {
    const result = phrases(["Cmaj7", "Am7", "Dm7", "G7"], C_MAJOR);
    expect(result.phrases).toHaveLength(1);
    const span = result.phrases[0];
    expect(span?.kind).toBe("turnaround");
    expect(span?.fromIndex).toBe(0);
    expect(span?.toIndex).toBe(3);
    expect(span?.label).toContain("turnaround in C");
  });

  test("a tritone substitution resolving down a half step is marked", () => {
    const result = phrases(["Db7", "Cmaj7"], C_MAJOR);
    const span = result.phrases[0];
    expect(span?.kind).toBe("tritone-substitution");
    expect(span?.label).toContain("tritone sub into C");
  });

  test("a bare V–I cadence is marked", () => {
    const result = phrases(["G7", "Cmaj7"], C_MAJOR);
    const span = result.phrases[0];
    expect(span?.kind).toBe("five-one");
    expect(span?.label).toBe("V–I in C");
  });

  test("dominants falling by fifths chain", () => {
    const result = phrases(["D7", "G7"], C_MAJOR);
    const span = result.phrases[0];
    expect(span?.kind).toBe("dominant-chain");
  });

  test("transposition: the ii–V–I bracket follows the chart to F with flat spelling", () => {
    const result = phrases(["Gm7", "C7", "Fmaj7"], F_MAJOR);
    const span = result.phrases[0];
    expect(span?.kind).toBe("two-five-one");
    expect(span?.label).toBe("ii–V–I in F");
  });

  test("rhythm-changes A covers its spans deterministically twice over", () => {
    const first = phrases(
      ["Bbmaj7", "G7", "Cm7", "F7", "Bbmaj7", "Bb7", "Ebmaj7", "Edim7"],
      keyOf("B", -1, "major"),
    );
    const second = phrases(
      ["Bbmaj7", "G7", "Cm7", "F7", "Bbmaj7", "Bb7", "Ebmaj7", "Edim7"],
      keyOf("B", -1, "major"),
    );
    expect(first.phrases).toEqual(second.phrases);
    expect(first.evidence.termination).toBe("complete");
    expect(first.evidence.eventsExamined).toBe(8);
  });
});

describe("deriveChordDetail — tones, guides, resolution, next", () => {
  test("Cmaj7 spells its four tones with roles and marks the guides", () => {
    const result = detail("Cmaj7", null, C_MAJOR);
    expect(result.tones.map((tone) => tone.name)).toEqual([
      "C",
      "E",
      "G",
      "B",
    ]);
    expect(result.tones[0]?.role).toBe("root");
    const guides = result.tones.filter((tone) => tone.guide);
    expect(guides.map((tone) => tone.name)).toEqual(["E", "B"]);
    expect(result.guideToneNames).toEqual(["E", "B"]);
  });

  test("G7 into Cmaj7: the seventh falls by step, the third holds", () => {
    const result = detail("G7", "Cmaj7", C_MAJOR);
    expect(result.resolution).not.toBeNull();
    const moves = result.resolution?.moves ?? [];
    /* G7 guides are B and F; into Cmaj7 (E,B): B holds, F steps to E. */
    const byFrom = new Map(moves.map((move) => [move.fromName, move]));
    expect(byFrom.get("B")?.motion).toBe("held");
    expect(byFrom.get("F")?.motion).toBe("step");
    expect(byFrom.get("F")?.toName).toBe("E");
    expect(result.resolution?.note).toBe("1 held, 1 by step");
    expect(result.resolution?.targetSymbol).toBe("Cmaj7");
  });

  test("after a dominant the first next option resolves down a fifth", () => {
    const result = detail("G7", null, C_MAJOR);
    expect(result.next.length).toBeGreaterThan(0);
    expect(result.next.length).toBeLessThanOrEqual(MAX_CHART_NEXT_OPTIONS);
    expect(result.next[0]?.symbolText).toBe("Cmaj7");
    expect(result.next[0]?.why).toContain("fifth");
    /* Deterministic ids so the UI can key rows. */
    expect(result.next[0]?.id).toBe("dominant:Cmaj7");
  });

  test("after a predominant the options complete the ii–V", () => {
    const result = detail("Dm7", null, C_MAJOR);
    expect(result.next[0]?.symbolText).toBe("G7");
    expect(result.next[0]?.why).toContain("V7");
  });

  test("next options are identical across calls (determinism)", () => {
    const first = detail("Cmaj7", null, C_MAJOR);
    const second = detail("Cmaj7", null, C_MAJOR);
    expect(first.next).toEqual(second.next);
  });

  test("transposition: options follow the chord, spelled for flat roots", () => {
    const result = detail("Bb7", null, keyOf("E", -1, "major"));
    expect(result.next[0]?.symbolText).toBe("Ebmaj7");
  });

  test("unkeyed detail still teaches tones and motion but claims no roman", () => {
    const result = detail("G7", "Cmaj7", null);
    expect(result.analysis.outcome).toBe("unkeyed");
    expect(result.analysis.roman).toBeNull();
    expect(result.tones.length).toBeGreaterThan(0);
    expect(result.resolution).not.toBeNull();
    for (const option of result.next) expect(option.roman).toBeNull();
  });
});
