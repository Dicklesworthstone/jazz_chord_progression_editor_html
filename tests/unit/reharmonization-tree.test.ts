import { describe, expect, test } from "bun:test";
import {
  type BeatValue,
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  buildReharmonizationTree,
  compareReharmonizationBranches,
} from "../../src/theory";

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

describe("G5 Proof-Carrying Reharmonization Tree", () => {
  test("builds branching reharmonization tree for standard ii-V-I (Dm7 -> G7 -> Cmaj7)", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e1"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
    ];

    const result = buildReharmonizationTree(events, { maxDepth: 2 });
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.tree.rootNode.chords).toEqual(["Dm7", "G7", "Cmaj7"]);
      expect(result.tree.rootNode.children.length).toBeGreaterThanOrEqual(2);

      const tritoneChild = result.tree.rootNode.children.find((c) =>
        c.chords.includes("Db7"),
      );
      expect(tritoneChild).toBeDefined();
      if (tritoneChild) {
        expect(tritoneChild.chords).toEqual(["Dm7", "Db7", "Cmaj7"]);
        expect(tritoneChild.proof.lawId).toBe("law.tritone-sub.primary");
        expect(tritoneChild.patch.length).toBe(1);
        expect(tritoneChild.patch[0]?.beforeChordSymbol).toBe("G7");
        expect(tritoneChild.patch[0]?.afterChordSymbol).toBe("Db7");
      }

      const secDomChild = result.tree.rootNode.children.find((c) =>
        c.chords.includes("A7"),
      );
      expect(secDomChild).toBeDefined();
      if (secDomChild) {
        expect(secDomChild.chords).toEqual(["Dm7", "G7", "A7"]);
        expect(secDomChild.proof.lawId).toBe("law.secondary-dominant.v-of-v");
      }
    }
  });

  test("compares two reharmonization branches and computes exact diff", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e1"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
    ];

    const result = buildReharmonizationTree(events, { maxDepth: 1 });
    expect(result.ok).toBe(true);

    if (result.ok) {
      const nodeA = result.tree.rootNode.children[0];
      const nodeB = result.tree.rootNode.children[1];
      expect(nodeA).toBeDefined();
      expect(nodeB).toBeDefined();

      if (nodeA && nodeB) {
        const comparison = compareReharmonizationBranches(nodeA, nodeB);
        expect(comparison.differingIndices.length).toBeGreaterThanOrEqual(1);
        expect(comparison.diffSummary).toMatch(/differ/);
      }
    }
  });

  test("refuses empty events with typed refusal", () => {
    const result = buildReharmonizationTree([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g5.empty_events");
    }
  });

  test("refuses depth exceeding limit of 3", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
    ];
    const result = buildReharmonizationTree(events, { maxDepth: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g5.depth_exceeded");
    }
  });
});
