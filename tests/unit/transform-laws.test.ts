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
});
