import {
  type ChordEventId,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type G9SessionResult,
  type PracticeAnswerSubmission,
  type PracticeGradeReport,
  type PracticeGradedItem,
  type PracticePrompt,
  type PracticePromptOption,
  type PracticeSession,
  type PracticeSessionOptions,
  G9_PRACTICE_RUBRIC_SCHEMA,
  G9_PRACTICE_SESSION_SCHEMA,
  MAX_G9_PROMPTS_PER_SESSION,
} from "./practice-laboratory-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  extractEventGuideTones,
  spelledPitchClassToString,
} from "./guide-tones";

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPracticeSession(
  events: readonly {
    eventId: ChordEventId;
    chordSymbol: string;
  }[],
  options?: PracticeSessionOptions,
): G9SessionResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g9.empty_events",
        message: "Events array cannot be empty",
      },
    };
  }

  const maxPrompts = options?.maxPrompts ?? 5;
  if (maxPrompts > MAX_G9_PROMPTS_PER_SESSION) {
    return {
      ok: false,
      refusal: {
        code: "g9.prompts_exceeded",
        message: `Requested prompts count ${String(maxPrompts)} exceeds limit of ${String(MAX_G9_PROMPTS_PER_SESSION)}`,
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const seed = options?.seed ?? 42;
  const rng = mulberry32(seed);

  const contextChords = events.map((e) => e.chordSymbol);
  const prompts: PracticePrompt[] = [];
  let workSteps = 0;

  for (const ev of events) {
    const parsed = parseChordSymbol(ev.chordSymbol, accidentalStyle);
    if (!parsed.ok) {
      return {
        ok: false,
        refusal: {
          code: "g9.invalid_chord",
          message: `Invalid chord symbol: ${ev.chordSymbol}`,
        },
      };
    }
  }

  // 1. Generate one spelling prompt
  const ev0 = events[0];
  if (ev0 && prompts.length < maxPrompts) {
    workSteps++;
    const gt = extractEventGuideTones(ev0.chordSymbol, ev0.eventId, undefined, accidentalStyle);
    const thirdTone = gt.guideTones.find((t) => t.degree.number === 3 || t.role === "third");
    const seventhTone = gt.guideTones.find((t) => t.degree.number === 7 || t.role === "seventh");
    const thirdStr = thirdTone ? spelledPitchClassToString(thirdTone.spelledPitchClass) : "None";
    const seventhStr = seventhTone ? spelledPitchClassToString(seventhTone.spelledPitchClass) : "None";

    const correctSpelling = `${thirdStr} and ${seventhStr}`;
    const distractor1 = "E and B";
    const distractor2 = "F and C";
    const distractor3 = "G and D";

    const spellingOptions: PracticePromptOption[] = [
      { optionId: "opt_correct", text: correctSpelling, isCorrect: true, feedback: "Correct guide tones!" },
      { optionId: "opt_d1", text: distractor1, isCorrect: false, feedback: "Incorrect pitches" },
      { optionId: "opt_d2", text: distractor2, isCorrect: false, feedback: "Incorrect pitches" },
      { optionId: "opt_d3", text: distractor3, isCorrect: false, feedback: "Incorrect pitches" },
    ];

    for (let oIdx = spellingOptions.length - 1; oIdx > 0; oIdx--) {
      const j = Math.floor(rng() * (oIdx + 1));
      const temp = spellingOptions[oIdx];
      const target = spellingOptions[j];
      if (temp && target) {
        spellingOptions[oIdx] = target;
        spellingOptions[j] = temp;
      }
    }

    prompts.push({
      promptId: `prompt_spelling_${String(prompts.length)}`,
      kind: "spelling",
      targetEventId: ev0.eventId,
      question: `What are the guide tones (3rd and 7th) of ${ev0.chordSymbol}?`,
      contextChords,
      options: spellingOptions,
      acceptedExactAnswers: [correctSpelling, `${thirdStr}, ${seventhStr}`, `${thirdStr} ${seventhStr}`],
      explanation: `For ${ev0.chordSymbol}, the 3rd is ${thirdStr} and the 7th is ${seventhStr}.`,
      pointsPossible: 10,
    });
  }

  // 2. Guide tones voice leading prompt if next chord exists
  if (events.length >= 2 && prompts.length < maxPrompts) {
    workSteps++;
    const evA = events[0];
    const evB = events[1];
    if (evA && evB) {
      const gtA = extractEventGuideTones(evA.chordSymbol, evA.eventId, undefined, accidentalStyle);
      const sevA = gtA.guideTones.find((t) => t.degree.number === 7 || t.role === "seventh");
      const sevAStr = sevA ? spelledPitchClassToString(sevA.spelledPitchClass) : "None";

      const gtB = extractEventGuideTones(evB.chordSymbol, evB.eventId, undefined, accidentalStyle);
      const thirdB = gtB.guideTones.find((t) => t.degree.number === 3 || t.role === "third");
      const thirdBStr = thirdB ? spelledPitchClassToString(thirdB.spelledPitchClass) : "None";

      const gtQuestion = `In the progression ${evA.chordSymbol} -> ${evB.chordSymbol}, how does the 7th (${sevAStr}) resolve?`;
      const gtCorrect = `Resolves stepwise to the 3rd (${thirdBStr})`;
      const gtOptions: PracticePromptOption[] = [
        { optionId: "opt_gt_correct", text: gtCorrect, isCorrect: true, feedback: "Exact jazz voice leading!" },
        { optionId: "opt_gt_d1", text: "Remains stationary as the root", isCorrect: false },
        { optionId: "opt_gt_d2", text: "Leaps up by a perfect fifth", isCorrect: false },
        { optionId: "opt_gt_d3", text: "Resolves down by a tritone", isCorrect: false },
      ];

      prompts.push({
        promptId: `prompt_gt_${String(prompts.length)}`,
        kind: "guide-tones",
        targetEventId: evA.eventId,
        question: gtQuestion,
        contextChords,
        options: gtOptions,
        acceptedExactAnswers: [gtCorrect, `Stepwise to ${thirdBStr}`],
        explanation: `The 7th of ${evA.chordSymbol} (${sevAStr}) resolves down by step to the 3rd of ${evB.chordSymbol} (${thirdBStr}).`,
        pointsPossible: 10,
      });
    }
  }

  // 3. Cadence recognition prompt
  if (events.length >= 2 && prompts.length < maxPrompts) {
    workSteps++;
    const firstChord = events[0]?.chordSymbol ?? "Dm7";
    const lastChord = events[events.length - 1]?.chordSymbol ?? "Cmaj7";
    const isAuthentic = lastChord.includes("maj7") || lastChord.includes("6");

    const cadCorrect = isAuthentic ? "Authentic Cadence / Resolution" : "Half Cadence / Continuation";
    const cadOptions: PracticePromptOption[] = [
      { optionId: "opt_cad_correct", text: cadCorrect, isCorrect: true, feedback: "Accurate cadential analysis!" },
      { optionId: "opt_cad_d1", text: "Plagal Cadence (IV -> I)", isCorrect: false },
      { optionId: "opt_cad_d2", text: "Deceptive Cadence (V -> vi)", isCorrect: false },
      { optionId: "opt_cad_d3", text: "Phrygian Half Cadence", isCorrect: false },
    ];

    prompts.push({
      promptId: `prompt_cadence_${String(prompts.length)}`,
      kind: "cadence-recognition",
      question: `What primary cadential motion is established across ${firstChord} ... -> ${lastChord}?`,
      contextChords,
      options: cadOptions,
      acceptedExactAnswers: [cadCorrect],
      explanation: `The progression terminates on ${lastChord}, establishing ${cadCorrect}.`,
      pointsPossible: 10,
    });
  }

  // Fill additional spelling prompts if maxPrompts permits
  for (let i = 1; i < events.length && prompts.length < maxPrompts; i++) {
    workSteps++;
    const ev = events[i];
    if (!ev) continue;

    const gt = extractEventGuideTones(ev.chordSymbol, ev.eventId, undefined, accidentalStyle);
    const thirdTone = gt.guideTones.find((t) => t.degree.number === 3 || t.role === "third");
    const seventhTone = gt.guideTones.find((t) => t.degree.number === 7 || t.role === "seventh");
    const thirdStr = thirdTone ? spelledPitchClassToString(thirdTone.spelledPitchClass) : "None";
    const seventhStr = seventhTone ? spelledPitchClassToString(seventhTone.spelledPitchClass) : "None";

    const correctSpelling = `${thirdStr} and ${seventhStr}`;
    const distractor1 = "E and B";
    const distractor2 = "F and C";
    const distractor3 = "G and D";

    const spellingOptions: PracticePromptOption[] = [
      { optionId: "opt_correct", text: correctSpelling, isCorrect: true, feedback: "Correct guide tones!" },
      { optionId: "opt_d1", text: distractor1, isCorrect: false, feedback: "Incorrect pitches" },
      { optionId: "opt_d2", text: distractor2, isCorrect: false, feedback: "Incorrect pitches" },
      { optionId: "opt_d3", text: distractor3, isCorrect: false, feedback: "Incorrect pitches" },
    ];

    prompts.push({
      promptId: `prompt_spelling_${String(prompts.length)}`,
      kind: "spelling",
      targetEventId: ev.eventId,
      question: `What are the guide tones (3rd and 7th) of ${ev.chordSymbol}?`,
      contextChords,
      options: spellingOptions,
      acceptedExactAnswers: [correctSpelling, `${thirdStr}, ${seventhStr}`, `${thirdStr} ${seventhStr}`],
      explanation: `For ${ev.chordSymbol}, the 3rd is ${thirdStr} and the 7th is ${seventhStr}.`,
      pointsPossible: 10,
    });
  }

  const totalPointsPossible = prompts.reduce((sum, p) => sum + p.pointsPossible, 0);

  const session: PracticeSession = {
    schema: G9_PRACTICE_SESSION_SCHEMA,
    sessionId: `session_${String(seed)}_${String(events.length)}`,
    seed,
    title: `Practice Laboratory Session (${contextChords.join(" - ")})`,
    exerciseKinds: ["spelling", "guide-tones", "cadence-recognition"],
    prompts,
    totalPointsPossible,
  };

  return {
    ok: true,
    session,
    workSteps,
  };
}

export function gradePracticeSubmission(
  session: PracticeSession,
  submissions: readonly PracticeAnswerSubmission[],
): PracticeGradeReport {
  const items: PracticeGradedItem[] = [];
  let totalPointsAwarded = 0;

  for (const prompt of session.prompts) {
    const sub = submissions.find((s) => s.promptId === prompt.promptId);
    if (!sub) {
      items.push({
        promptId: prompt.promptId,
        isCorrect: false,
        pointsAwarded: 0,
        feedback: "No answer submitted.",
      });
      continue;
    }

    let isCorrect = false;
    let feedback = "Incorrect answer.";

    if (sub.selectedOptionId) {
      const opt = prompt.options.find((o) => o.optionId === sub.selectedOptionId);
      if (opt?.isCorrect) {
        isCorrect = true;
        feedback = opt.feedback ?? "Correct!";
      }
    } else if (sub.textAnswer) {
      const normAnswer = sub.textAnswer.trim().toLowerCase();
      const match = prompt.acceptedExactAnswers.some(
        (ans) => ans.trim().toLowerCase() === normAnswer,
      );
      if (match) {
        isCorrect = true;
        feedback = "Exact textual match!";
      }
    }

    const pointsAwarded = isCorrect ? prompt.pointsPossible : 0;
    totalPointsAwarded += pointsAwarded;

    items.push({
      promptId: prompt.promptId,
      isCorrect,
      pointsAwarded,
      feedback,
    });
  }

  const totalPossible = session.totalPointsPossible;
  const scorePercentage =
    totalPossible > 0 ? Math.round((totalPointsAwarded / totalPossible) * 100) : 100;

  return {
    schema: G9_PRACTICE_RUBRIC_SCHEMA,
    sessionId: session.sessionId,
    items,
    totalPointsAwarded,
    totalPointsPossible: totalPossible,
    scorePercentage,
  };
}
