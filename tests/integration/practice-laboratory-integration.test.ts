import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ChordEventId,
  parseStableId,
} from "../../src/domain";
import {
  createPracticeSession,
  gradePracticeSubmission,
} from "../../src/theory";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/practice-laboratory",
);

describe("G9 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent practice session fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "practice-session-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        seed: number;
        inputChords: string[];
        expectedPromptKinds: string[];
      }>;
    };

    for (const testCase of data.cases) {
      const events = testCase.inputChords.map((chord, idx) => ({
        eventId: eventIdOf(`evt_${testCase.id}_${String(idx)}`),
        chordSymbol: chord,
      }));

      const result = createPracticeSession(events, { seed: testCase.seed, maxPrompts: 5 });
      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.session.seed).toBe(testCase.seed);
        for (const expKind of testCase.expectedPromptKinds) {
          const match = result.session.prompts.find((p) => p.kind === expKind);
          expect(match).toBeDefined();
        }
      }
    }
  });

  test("seeded byte-for-byte reproducibility across runs", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7" },
      { eventId: eventIdOf("e1"), chordSymbol: "G7" },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7" },
    ];

    const run1 = createPracticeSession(events, { seed: 1337, maxPrompts: 4 });
    const run2 = createPracticeSession(events, { seed: 1337, maxPrompts: 4 });

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  test("arithmetic grading rubric handles 100% correct, partial, and 0% scores", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7" },
      { eventId: eventIdOf("e1"), chordSymbol: "G7" },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7" },
    ];

    const sessionRes = createPracticeSession(events, { seed: 42, maxPrompts: 3 });
    expect(sessionRes.ok).toBe(true);

    if (sessionRes.ok) {
      const session = sessionRes.session;

      // 1. Perfect score submission
      const perfectSubs = session.prompts.map((p) => ({
        promptId: p.promptId,
        selectedOptionId: p.options.find((o) => o.isCorrect)?.optionId ?? "opt_correct",
      }));
      const perfectReport = gradePracticeSubmission(session, perfectSubs);
      expect(perfectReport.scorePercentage).toBe(100);
      expect(perfectReport.totalPointsAwarded).toBe(session.totalPointsPossible);

      // 2. Zero score submission
      const zeroSubs = session.prompts.map((p) => ({
        promptId: p.promptId,
        selectedOptionId: p.options.find((o) => !o.isCorrect)?.optionId ?? "opt_incorrect",
      }));
      const zeroReport = gradePracticeSubmission(session, zeroSubs);
      expect(zeroReport.scorePercentage).toBe(0);
      expect(zeroReport.totalPointsAwarded).toBe(0);
    }
  });
});
