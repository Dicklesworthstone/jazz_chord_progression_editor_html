import { describe, expect, test } from "bun:test";
import {
  type BeatValue,
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  evaluateTransformCandidates,
  getTransformLaw,
  listTransformLaws,
} from "../../src/theory/transform-laws";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1): BeatValue {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat value: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

describe("H1 Transform Laws Registry and Evaluation", () => {
  describe("registry", () => {
    test("retrieves known law by lawId", () => {
      const law = getTransformLaw("law.tritone-sub.primary");
      expect(law).toBeDefined();
      if (law) {
        expect(law.family).toBe("tritone-substitute");
        expect(law.postconditions.preservedGuideTones).toBe(true);
      }
    });

    test("lists laws filtered by family", () => {
      const tritoneLaws = listTransformLaws("tritone-substitute");
      expect(tritoneLaws.length).toBeGreaterThanOrEqual(1);
      for (const l of tritoneLaws) {
        expect(l.family).toBe("tritone-substitute");
      }
    });
  });

  describe("evaluateTransformCandidates", () => {
    test("generates tritone substitution candidate for dominant chord G7", () => {
      const events = [
        { eventId: eventIdOf("e1"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
        { eventId: eventIdOf("e2"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
        { eventId: eventIdOf("e3"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
      ];

      const result = evaluateTransformCandidates(events, 1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const tritoneCand = result.candidates.find((c) => c.lawId === "law.tritone-sub.primary");
        expect(tritoneCand).toBeDefined();
        if (tritoneCand) {
          expect(tritoneCand.transformedProgression[1]).toBe("Db7");
          expect(tritoneCand.editPlan.operations.length).toBe(1);
          expect(tritoneCand.editPlan.maintainsTimeBalance).toBe(true);
        }
      }
    });

    test("generates secondary dominant candidate for minor ii chord Dm7", () => {
      const events = [
        { eventId: eventIdOf("e1"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
        { eventId: eventIdOf("e2"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
        { eventId: eventIdOf("e3"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
      ];

      const result = evaluateTransformCandidates(events, 0);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const secDom = result.candidates.find((c) => c.lawId === "law.secondary-dominant.v-of-v");
        expect(secDom).toBeDefined();
        if (secDom) {
          expect(secDom.transformedProgression[0]).toBe("D7");
        }
      }
    });

    test("no secondary dominant unless the next chord's root is a fourth above", () => {
      const lawsFor = (symbols: readonly string[]) => {
        const events = symbols.map((chordSymbol, index) => ({
          eventId: eventIdOf(`e${String(index)}`), chordSymbol, offsetBeat: beat(index * 4), duration: beat(4),
        }));
        const result = evaluateTransformCandidates(events, 0);
        return result.ok ? result.candidates.map((c) => c.lawId) : [];
      };
      expect(lawsFor(["Dm7", "G7"])).toContain("law.secondary-dominant.v-of-v");
      // Near misses: D7 does not tonicize C, and a final Dm7 has nothing to tonicize.
      expect(lawsFor(["Dm7", "Cmaj7"])).not.toContain("law.secondary-dominant.v-of-v");
      expect(lawsFor(["Dm7"])).not.toContain("law.secondary-dominant.v-of-v");
      // Transposed: Ebm7 -> Ab7 still qualifies, spelled from the source root.
      const eb = evaluateTransformCandidates([
        { eventId: eventIdOf("e0"), chordSymbol: "Ebm7", offsetBeat: beat(0), duration: beat(4) },
        { eventId: eventIdOf("e1"), chordSymbol: "Ab7", offsetBeat: beat(4), duration: beat(4) },
      ], 0);
      expect(eb.ok && eb.candidates.find((c) => c.lawId === "law.secondary-dominant.v-of-v")?.transformedProgression[0]).toBe("Eb7");
    });

    test("the tritone substitute takes the plainer of its two spellings", () => {
      const subFor = (symbol: string) => {
        const result = evaluateTransformCandidates([
          { eventId: eventIdOf("e0"), chordSymbol: symbol, offsetBeat: beat(0), duration: beat(4) },
        ], 0);
        return result.ok ? result.candidates.find((c) => c.lawId === "law.tritone-sub.primary")?.transformedProgression[0] : undefined;
      };
      // Hand-derived: six semitones away, spelled with the fewest accidentals.
      expect(subFor("G7")).toBe("Db7");
      expect(subFor("Ab7")).toBe("D7");
      expect(subFor("Db7")).toBe("G7");
      expect(subFor("F#7")).toBe("C7");
      expect(subFor("B7")).toBe("F7");
      expect(subFor("E7")).toBe("Bb7");
      expect(subFor("C7")).toBe("Gb7");
    });

    test("a plain major triad borrows a plain minor triad, not an added seventh", () => {
      const result = evaluateTransformCandidates([
        { eventId: eventIdOf("e0"), chordSymbol: "F", offsetBeat: beat(0), duration: beat(4) },
      ], 0);
      const borrow = result.ok ? result.candidates.find((c) => c.lawId === "law.modal-interchange.subdominant-minor") : undefined;
      expect(borrow?.transformedProgression[0]).toBe("Fm");
    });

    test("generates modal interchange candidate for subdominant IV chord Fmaj7", () => {
      const events = [
        { eventId: eventIdOf("e1"), chordSymbol: "Fmaj7", offsetBeat: beat(0), duration: beat(4) },
        { eventId: eventIdOf("e2"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
        { eventId: eventIdOf("e3"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
      ];

      const result = evaluateTransformCandidates(events, 0);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const modalInt = result.candidates.find((c) => c.lawId === "law.modal-interchange.subdominant-minor");
        expect(modalInt).toBeDefined();
        if (modalInt) {
          expect(modalInt.transformedProgression[0]).toBe("Fm7");
        }
      }
    });

    test("refuses out-of-range target index with typed refusal", () => {
      const events = [
        { eventId: eventIdOf("e1"), chordSymbol: "Cmaj7", offsetBeat: beat(0), duration: beat(4) },
      ];
      const result = evaluateTransformCandidates(events, 5);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe("h1.empty_target");
      }
    });

    test("refuses invalid chord with typed refusal", () => {
      const events = [
        { eventId: eventIdOf("e1"), chordSymbol: "InvalidChord!#$", offsetBeat: beat(0), duration: beat(4) },
      ];
      const result = evaluateTransformCandidates(events, 0);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe("h1.invalid_chord");
      }
    });
  });

  test("the secondary ii-V split keeps exact time for any dominant length", () => {
    /* Hand-derived: each half is exactly half the dominant; the halves sum to it. */
    for (const [numerator, denominator] of [[1, 1], [3, 1], [4, 1], [3, 2]] as const) {
      const result = evaluateTransformCandidates(
        [{ eventId: eventIdOf("dom"), chordSymbol: "G7", offsetBeat: beat(2), duration: beat(numerator, denominator) }],
        0,
      );
      if (!result.ok) throw new Error("refused");
      const split = result.candidates.find((candidate) => candidate.family === "secondary-ii-v");
      if (split === undefined) throw new Error("no ii-V candidate");
      const [first, second] = split.editPlan.operations;
      expect(first?.duration).toEqual(beat(numerator, denominator * 2));
      expect(second?.duration).toEqual(beat(numerator, denominator * 2));
      expect(second?.offsetBeat).toEqual(beat(2 * denominator * 2 + numerator, denominator * 2));
      expect(split.editPlan.totalNewDuration).toEqual(beat(numerator, denominator));
      expect(split.editPlan.maintainsTimeBalance).toBe(true);
    }
  });

  test("no ii-V insertion when the related ii already precedes the dominant", () => {
    const at = (symbol: string, offset: number) =>
      ({ eventId: eventIdOf(`g_${symbol.toLowerCase()}_${String(offset)}`), chordSymbol: symbol, offsetBeat: beat(offset), duration: beat(4) });
    const families = (events: Parameters<typeof evaluateTransformCandidates>[0], index: number) => {
      const result = evaluateTransformCandidates(events, index);
      return result.ok ? result.candidates.map((candidate) => candidate.family) : [];
    };
    /* Dm7 G7: the ii is already there, so no insertion is offered. */
    expect(families([at("Dm7", 0), at("G7", 4)], 1)).not.toContain("secondary-ii-v");
    /* Near-miss: Fmaj7 G7 has no ii before G7, so the insertion is offered. */
    expect(families([at("Fmaj7", 0), at("G7", 4)], 1)).toContain("secondary-ii-v");
  });
});

