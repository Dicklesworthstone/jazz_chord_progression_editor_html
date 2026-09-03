import { describe, expect, test } from "bun:test";
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

describe("G9 Deterministic Chart-to-Practice Laboratory", () => {
  test("generates deterministic practice session for ii-V-I (Dm7 -> G7 -> Cmaj7)", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7" },
      { eventId: eventIdOf("e1"), chordSymbol: "G7" },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7" },
    ];

    const result = createPracticeSession(events, { seed: 42, maxPrompts: 4 });
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.session.prompts.length).toBeGreaterThanOrEqual(3);
      expect(result.session.seed).toBe(42);

      const spellingPrompt = result.session.prompts.find((p) => p.kind === "spelling");
      expect(spellingPrompt).toBeDefined();
      if (spellingPrompt) {
        expect(spellingPrompt.acceptedExactAnswers.length).toBeGreaterThan(0);
        expect(spellingPrompt.options.length).toBe(4);
        const correctOpt = spellingPrompt.options.find((o) => o.isCorrect);
        expect(correctOpt).toBeDefined();
      }

      const gtPrompt = result.session.prompts.find((p) => p.kind === "guide-tones");
      expect(gtPrompt).toBeDefined();

      const cadPrompt = result.session.prompts.find((p) => p.kind === "cadence-recognition");
      expect(cadPrompt).toBeDefined();
    }
  });

  test("grades practice submissions accurately with itemized point accounting", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7" },
      { eventId: eventIdOf("e1"), chordSymbol: "G7" },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7" },
    ];

    const result = createPracticeSession(events, { seed: 42, maxPrompts: 3 });
    expect(result.ok).toBe(true);

    if (result.ok) {
      const session = result.session;
      const prompt0 = session.prompts[0];
      const prompt1 = session.prompts[1];
      const prompt2 = session.prompts[2];

      expect(prompt0).toBeDefined();
      expect(prompt1).toBeDefined();
      expect(prompt2).toBeDefined();

      if (prompt0 && prompt1 && prompt2) {
        const correctOpt0 = prompt0.options.find((o) => o.isCorrect);
        const incorrectOpt1 = prompt1.options.find((o) => !o.isCorrect);
        const textAns2 = prompt2.acceptedExactAnswers[0];

        const submissions = [
          ...(correctOpt0?.optionId ? [{ promptId: prompt0.promptId, selectedOptionId: correctOpt0.optionId }] : []),
          ...(incorrectOpt1?.optionId ? [{ promptId: prompt1.promptId, selectedOptionId: incorrectOpt1.optionId }] : []),
          ...(textAns2 ? [{ promptId: prompt2.promptId, textAnswer: textAns2 }] : []),
        ];

        const gradeReport = gradePracticeSubmission(session, submissions);
        expect(gradeReport.items.length).toBe(session.prompts.length);
        expect(gradeReport.items[0]?.isCorrect).toBe(true);
        expect(gradeReport.items[1]?.isCorrect).toBe(false);
        expect(gradeReport.items[2]?.isCorrect).toBe(true);
        expect(gradeReport.totalPointsAwarded).toBe(20);
        expect(gradeReport.totalPointsPossible).toBe(30);
        expect(gradeReport.scorePercentage).toBe(67);
      }
    }
  });

  test("refuses empty events with typed refusal", () => {
    const result = createPracticeSession([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g9.empty_events");
    }
  });

  test("refuses maxPrompts exceeding limit of 32", () => {
    const events = [{ eventId: eventIdOf("e0"), chordSymbol: "Dm7" }];
    const result = createPracticeSession(events, { maxPrompts: 33 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g9.prompts_exceeded");
    }
  });
});
