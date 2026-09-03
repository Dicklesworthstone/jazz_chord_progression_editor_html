import { describe, expect, test } from "bun:test";
import {
  type BeatValue,
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import { generateContextualContinuations } from "../../src/theory";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1): BeatValue {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

describe("G2 Contextual Continuation Engine", () => {
  test("generates functional resolution candidates for ii-V context (G7 -> Cmaj7 / Cm7)", () => {
    const events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[] = [
      { eventId: eventIdOf("e1"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
    ];

    const result = generateContextualContinuations(events);
    expect(result.ok).toBe(true);

    if (result.ok && "candidates" in result) {
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      const cmaj = result.candidates.find((c) => c.chordSymbol === "Cmaj7");
      expect(cmaj).toBeDefined();
      if (cmaj) {
        expect(cmaj.providerId).toBe("provider.functional.circle-cadence");
        expect(cmaj.category).toBe("functional");
        expect(cmaj.proof.expectedMotion).toBe("cycle-fifth");
        expect(cmaj.editPlan.offsetBeat).toEqual(beat(8));
      }
    }
  });

  test("generates turnaround secondary dominant and passing diminished for tonic context (Cmaj7 -> A7 / C#dim7)", () => {
    const events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[] = [
      { eventId: eventIdOf("e1"), chordSymbol: "Cmaj7", offsetBeat: beat(0), duration: beat(4) },
    ];

    const result = generateContextualContinuations(events);
    expect(result.ok).toBe(true);

    if (result.ok && "candidates" in result) {
      const a7 = result.candidates.find((c) => c.chordSymbol === "A7");
      expect(a7).toBeDefined();
      if (a7) {
        expect(a7.category).toBe("functional");
      }

      const csDim = result.candidates.find((c) => c.chordSymbol === "C#dim7");
      expect(csDim).toBeDefined();
      if (csDim) {
        expect(csDim.category).toBe("colorful");
        expect(csDim.proof.expectedMotion).toBe("chromatic");
      }
    }
  });

  test("generates minor line-cliche candidate for minor context (Dm -> Dm(maj7))", () => {
    const events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[] = [
      { eventId: eventIdOf("e1"), chordSymbol: "Dm", offsetBeat: beat(0), duration: beat(4) },
    ];

    const result = generateContextualContinuations(events);
    expect(result.ok).toBe(true);

    if (result.ok && "candidates" in result) {
      const lineCliche = result.candidates.find((c) => c.chordSymbol === "Dm(maj7)");
      expect(lineCliche).toBeDefined();
      if (lineCliche) {
        expect(lineCliche.category).toBe("smooth");
        expect(lineCliche.providerId).toBe("provider.line-cliche.minor-step");
      }
    }
  });

  test("refuses empty context with typed refusal", () => {
    const result = generateContextualContinuations([]);
    expect(result.ok).toBe(false);
    if (!result.ok && "refusal" in result) {
      expect(result.refusal.code).toBe("g2.empty_context");
    }
  });

  test("refuses context exceeding 8 events with typed refusal", () => {
    const hugeContext: {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[] = [];
    for (let i = 0; i < 9; i++) {
      hugeContext.push({
        eventId: eventIdOf(`ctx_${String(i)}`),
        chordSymbol: "Cmaj7",
        offsetBeat: beat(i * 4),
        duration: beat(4),
      });
    }

    const result = generateContextualContinuations(hugeContext);
    expect(result.ok).toBe(false);
    if (!result.ok && "refusal" in result) {
      expect(result.refusal.code).toBe("g2.context_exceeded");
    }
  });
});
