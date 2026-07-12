import { describe, expect, test } from "bun:test";

import {
  makeAutoVoiceCount,
  makeAutoVoicing,
  makeChordDegree,
  makeChordEvent,
  makeChordSpec,
  makeCustomChordSpec,
  makeFrozenVoicing,
  makeManualVoicing,
  makeMidiRange,
  transitionFrozenToAuto,
  validateChordDegreeArray,
  validateOmissionArray,
  type AutoBassPolicy,
  type AutoVoicingFamily,
  type ChordDegree,
  type ChordSpecInput,
  type FrozenVoicing,
} from "../../src/domain/chord";
import { makeBeatDuration } from "../../src/domain/duration";
import { parseStableId } from "../../src/domain/ids";
import type { DomainOperations } from "../../src/domain/operations";
import {
  makeSpelledPitch,
  makeSpelledPitchClass,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../../src/domain/pitch";

type TestResult<Value, Refusal = unknown> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; refusal: Refusal }>;

function valueOf<Value>(result: TestResult<Value>): Value {
  if (!result.ok) {
    throw new Error(`unexpected refusal: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

function pitchClass(step: string, alter = 0): SpelledPitchClass {
  return valueOf(makeSpelledPitchClass({ step, alter }));
}

function pitch(step: string, octave: number, alter = 0): SpelledPitch {
  return valueOf(makeSpelledPitch({ step, alter, octave }));
}

function degree(number: number, alter = 0): ChordDegree {
  return valueOf(makeChordDegree({ number, alter }));
}

function parsedChord(
  bass: SpelledPitchClass | null = null,
): ChordSpecInput {
  return {
    kind: "parsed",
    sourceText: bass === null ? "C7" : "C7/Db",
    root: pitchClass("C"),
    triad: "major",
    sixth: null,
    seventh: "minor",
    extensions: [degree(9)],
    additions: [degree(11, 1)],
    alterations: [],
    omissions: [5],
    bass,
    colorPolicy: "none",
  };
}

const eventId = valueOf(parseStableId("event", "event-f1-chord-runtime"));
const oneBeat = valueOf(makeBeatDuration({ numerator: 1, denominator: 1 }));
const autoFamilies: readonly AutoVoicingFamily[] = [
  "balanced",
  "shell",
  "rootless-a",
  "rootless-b",
  "open",
  "drop2",
  "quartal",
];
const autoBassPolicies: readonly AutoBassPolicy[] = [
  "generated",
  "external",
  "none",
];

const implementedChordOperations = {
  makeChordDegree,
  validateChordDegreeArray,
  validateOmissionArray,
  makeMidiRange,
  makeAutoVoiceCount,
  makeChordSpec,
  makeCustomChordSpec,
  makeAutoVoicing,
  makeManualVoicing,
  makeFrozenVoicing,
  makeChordEvent,
  transitionFrozenToAuto,
} satisfies Pick<
  DomainOperations,
  | "makeChordDegree"
  | "validateChordDegreeArray"
  | "validateOmissionArray"
  | "makeMidiRange"
  | "makeAutoVoiceCount"
  | "makeChordSpec"
  | "makeCustomChordSpec"
  | "makeAutoVoicing"
  | "makeManualVoicing"
  | "makeFrozenVoicing"
  | "makeChordEvent"
  | "transitionFrozenToAuto"
>;

describe("F1 chord construction against the reviewed chord-shape corpus", () => {
  test("implements every chord-related callable frozen by DomainOperations", () => {
    expect(Object.keys(implementedChordOperations)).toHaveLength(12);
  });

  test("F1-CHORD-003/004/021-025 enforce exact degree memberships", () => {
    expect(makeChordDegree({ number: 8, alter: 0 })).toMatchObject({
      ok: false,
      refusal: { code: "chord.degree_number_invalid", path: ["number"] },
    });
    expect(makeChordDegree({ number: 3.5, alter: 0 })).toMatchObject({
      ok: false,
      refusal: { code: "chord.degree_number_invalid", path: ["number"] },
    });
    expect(makeChordDegree({ number: Number.NaN, alter: 0 })).toMatchObject({
      ok: false,
      refusal: { code: "chord.degree_number_invalid", path: ["number"] },
    });
    expect(makeChordDegree({ number: 9, alter: 0.5 })).toMatchObject({
      ok: false,
      refusal: {
        code: "chord.degree_alter_out_of_range",
        path: ["alter"],
      },
    });
    for (const alter of [-2, -1, 0, 1, 2]) {
      expect(makeChordDegree({ number: 3, alter }).ok).toBe(true);
    }

    const degreeOperation: DomainOperations["makeChordDegree"] =
      makeChordDegree;
    const literalSixthResult = degreeOperation({ number: 6, alter: 0 });
    if (!literalSixthResult.ok) {
      throw new Error("literal degree 6 unexpectedly refused");
    }
    const literalSixth: NonNullable<ChordSpecInput["sixth"]> =
      literalSixthResult.value;
    expect(
      makeChordSpec({ ...parsedChord(), sixth: literalSixth }),
    ).toMatchObject({
      ok: true,
      value: { sixth: { number: 6, alter: 0 } },
    });
  });

  test("F1-CHORD-009-013/018-020 preserve canonical arrays without cross-category invention", () => {
    expect(
      validateChordDegreeArray("extensions", [degree(9), degree(7)]),
    ).toMatchObject({
      ok: false,
      refusal: { code: "chord.degree_order", path: ["extensions"] },
    });
    expect(
      validateChordDegreeArray("additions", [degree(9), degree(9)]),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "chord.degree_duplicate",
        path: ["additions", 1],
      },
    });

    const alterations = [degree(9, -1), degree(9, 1), degree(13, -1)];
    const accepted = valueOf(
      validateChordDegreeArray("alterations", alterations),
    );
    expect(accepted).toEqual(alterations);
    expect(accepted).not.toBe(alterations);
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(
      validateChordDegreeArray("alterations", [
        degree(9, 1),
        degree(9, -1),
      ]),
    ).toMatchObject({
      ok: false,
      refusal: { code: "chord.degree_order", path: ["alterations"] },
    });

    expect(validateOmissionArray([3, 3])).toMatchObject({
      ok: false,
      refusal: {
        code: "chord.degree_duplicate",
        path: ["omissions", 1],
      },
    });
    expect(validateOmissionArray([7, 3])).toMatchObject({
      ok: false,
      refusal: { code: "chord.degree_order", path: ["omissions"] },
    });

    const chord = valueOf(
      makeChordSpec({
        ...parsedChord(),
        extensions: [degree(9)],
        additions: [degree(9)],
      }),
    );
    expect(chord.extensions).toEqual([{ number: 9, alter: 0 }]);
    expect(chord.additions).toEqual([{ number: 9, alter: 0 }]);
  });

  test("F1-CHORD-014/016 preserve every parsed and custom source field exactly", () => {
    const chordInput = parsedChord(pitchClass("D", -1));
    const chord = valueOf(makeChordSpec(chordInput));
    expect(chord).toEqual(chordInput);
    expect(chord.extensions).not.toBe(chordInput.extensions);

    const names = [
      pitchClass("F", 1),
      pitchClass("C"),
      pitchClass("F", 1),
      pitchClass("D", -1),
    ];
    const custom = valueOf(
      makeCustomChordSpec({
        kind: "custom",
        sourceText: "Unsorted literal",
        label: "Unsorted literal",
        pitchNames: names,
        bass: pitchClass("B", 1),
      }),
    );
    expect([...custom.pitchNames]).toEqual(names);
    expect(custom.pitchNames).not.toBe(names);
    expect(makeCustomChordSpec({ ...custom, pitchNames: [] })).toMatchObject({
      ok: false,
      refusal: { code: "custom.pitch_names_empty", path: ["pitchNames"] },
    });
    expect(
      makeCustomChordSpec({
        ...custom,
        pitchNames: Array.from({ length: 17 }, () => pitchClass("C")),
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "limit.voicing_notes_exceeded",
        path: ["pitchNames"],
      },
    });
  });
});

describe("F1 automatic voicing construction against the reviewed matrix", () => {
  test("F1-VOICE-019-023/029-030 enforce voice-count and inclusive MIDI range", () => {
    expect(makeAutoVoiceCount(2)).toMatchObject({
      ok: false,
      refusal: { code: "voicing.voice_count_invalid", path: ["voiceCount"] },
    });
    expect(makeAutoVoiceCount(3.5)).toMatchObject({
      ok: false,
      refusal: { code: "voicing.voice_count_invalid", path: ["voiceCount"] },
    });
    expect(makeAutoVoiceCount(Number.NaN)).toMatchObject({
      ok: false,
      refusal: { code: "voicing.voice_count_invalid", path: ["voiceCount"] },
    });
    expect(makeMidiRange(0, 127).ok).toBe(true);
    expect(makeMidiRange(85, 84)).toMatchObject({
      ok: false,
      refusal: { code: "voicing.range_reversed", path: ["highMidi"] },
    });
    expect(makeMidiRange(-1, 84)).toMatchObject({
      ok: false,
      refusal: { code: "pitch.midi_out_of_range", path: ["lowMidi"] },
    });
    expect(makeMidiRange(48, 128)).toMatchObject({
      ok: false,
      refusal: { code: "pitch.midi_out_of_range", path: ["highMidi"] },
    });
  });

  test("F1-VOICE-AUTO-MATRIX-001-007 implement every family/bass-policy cell", () => {
    const slashBass = pitchClass("D", -1);

    for (const family of autoFamilies) {
      for (const bassPolicy of autoBassPolicies) {
        for (const chordBass of [null, slashBass]) {
          const result = makeAutoVoicing(
            {
              mode: "auto",
              family,
              voiceCount: 4,
              range: { lowMidi: 48, highMidi: 84 },
              bassPolicy,
            },
            chordBass,
          );
          const isRootless = family === "rootless-a" || family === "rootless-b";
          if (isRootless && bassPolicy !== "external") {
            expect(result).toMatchObject({
              ok: false,
              refusal: {
                code: "voicing.rootless_requires_external",
                path: ["bassPolicy"],
              },
            });
          } else if (chordBass !== null && bassPolicy === "none") {
            expect(result).toMatchObject({
              ok: false,
              refusal: {
                code: "voicing.slash_bass_policy_none",
                path: ["bassPolicy"],
              },
            });
          } else {
            expect(result).toMatchObject({
              ok: true,
              value: { family, bassPolicy, voiceCount: 4 },
            });
          }
        }
      }
    }
  });

  test("auto range refusals retain nested operation paths", () => {
    expect(
      makeAutoVoicing(
        {
          mode: "auto",
          family: "balanced",
          voiceCount: 4,
          range: { lowMidi: -1, highMidi: 84 },
          bassPolicy: "generated",
        },
        null,
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "pitch.midi_out_of_range",
        path: ["range", "lowMidi"],
      },
    });
  });
});

describe("F1 exact stored voicings against the reviewed bass contract", () => {
  test("F1-VOICE-001/005 preserve order, spellings, unisons, and the exact limit", () => {
    const input = [
      pitch("C", 4),
      pitch("C", 3),
      pitch("B", 3, 1),
      pitch("G", 3),
      pitch("C", 4),
    ];
    const manual = valueOf(
      makeManualVoicing(
        { mode: "manual", pitches: input, bassPolicy: "included" },
        null,
      ),
    );
    expect([...manual.pitches]).toEqual(input);
    expect(manual.pitches).not.toBe(input);
    expect(Object.isFrozen(manual.pitches)).toBe(true);

    const sixteen = Array.from({ length: 16 }, () => pitch("C", 4));
    expect(
      makeManualVoicing(
        { mode: "manual", pitches: sixteen, bassPolicy: "included" },
        null,
      ).ok,
    ).toBe(true);
    expect(
      makeManualVoicing(
        {
          mode: "manual",
          pitches: [...sixteen, pitch("C", 4)],
          bassPolicy: "included",
        },
        null,
      ),
    ).toMatchObject({
      ok: false,
      refusal: { code: "limit.voicing_notes_exceeded", path: ["pitches"] },
    });
  });

  test("F1-VOICE-007-012/035/041-042 enforce exact included and sounding-class external bass", () => {
    expect(
      makeManualVoicing(
        {
          mode: "manual",
          bassPolicy: "included",
          pitches: [pitch("E", 3), pitch("G", 3), pitch("C", 3)],
        },
        pitchClass("C"),
      ).ok,
    ).toBe(true);

    expect(
      makeManualVoicing(
        {
          mode: "manual",
          bassPolicy: "included",
          pitches: [pitch("C", 4), pitch("E", 3), pitch("G", 3)],
        },
        pitchClass("C"),
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.included_bass_not_lowest",
        path: ["pitches", 1],
      },
    });

    expect(
      makeManualVoicing(
        {
          mode: "manual",
          bassPolicy: "included",
          pitches: [pitch("E", 4), pitch("C", 4), pitch("B", 3, 1)],
        },
        pitchClass("B", 1),
      ).ok,
    ).toBe(true);

    expect(
      makeManualVoicing(
        {
          mode: "manual",
          bassPolicy: "included",
          pitches: [pitch("E", 4), pitch("C", 4), pitch("D", 4, -2)],
        },
        pitchClass("B", 1),
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.included_bass_spelling_mismatch",
        path: ["pitches", 1],
      },
    });

    expect(
      makeManualVoicing(
        {
          mode: "manual",
          bassPolicy: "external",
          pitches: [pitch("E", 3), pitch("G", 3), pitch("C", 4)],
        },
        pitchClass("B", 1),
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.external_bass_included",
        path: ["pitches", 2],
      },
    });

    expect(
      makeManualVoicing(
        {
          mode: "manual",
          bassPolicy: "external",
          pitches: [pitch("E", 3)],
        },
        null,
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.external_without_slash_bass",
        path: ["bassPolicy"],
      },
    });
  });

  test("stored-bass checks remain exact outside MIDI instead of refusing or sorting", () => {
    const result = makeManualVoicing(
      {
        mode: "manual",
        bassPolicy: "included",
        pitches: [pitch("E", -1), pitch("C", -2), pitch("G", -1)],
      },
      pitchClass("C"),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { pitches: [{ step: "E" }, { step: "C" }, { step: "G" }] },
    });
  });

  test("F1-VOICE-002/004/013/028/033-039 apply the same matrix to Frozen", () => {
    const generatedBy = {
      engineVersion: "fixture-v1",
      family: "open",
    } as const;
    const exactPitches = [
      pitch("B", 3, -1),
      pitch("D", 3, -1),
      pitch("F", 3, 1),
      pitch("C", 3, 1),
      pitch("B", 3, -1),
    ];
    const frozen = valueOf(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: exactPitches,
          generatedBy,
        },
        null,
      ),
    );
    expect([...frozen.pitches]).toEqual(exactPitches);
    expect(frozen.pitches).not.toBe(exactPitches);
    expect(frozen.generatedBy).toEqual(generatedBy);
    expect(Object.isFrozen(frozen.generatedBy)).toBe(true);

    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [],
          generatedBy,
        },
        null,
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.pitches_empty",
        mode: "frozen",
        path: ["pitches"],
      },
    });

    const sixteen = Array.from({ length: 16 }, () => pitch("C", 4));
    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: sixteen,
          generatedBy,
        },
        null,
      ),
    ).toMatchObject({ ok: true, value: { pitches: { length: 16 } } });
    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [...sixteen, pitch("C", 4)],
          generatedBy,
        },
        null,
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "limit.voicing_notes_exceeded",
        path: ["pitches"],
      },
    });

    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [pitch("D", 3, -1), pitch("F", 3), pitch("A", 3, -1)],
          generatedBy,
        },
        pitchClass("D", -1),
      ).ok,
    ).toBe(true);
    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [pitch("D", 4, -1), pitch("F", 3), pitch("A", 3, -1)],
          generatedBy,
        },
        pitchClass("D", -1),
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.included_bass_not_lowest",
        path: ["pitches", 1],
      },
    });
    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [pitch("C", 4), pitch("E", 4), pitch("G", 4)],
          generatedBy,
        },
        pitchClass("B", 1),
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.included_bass_spelling_mismatch",
        path: ["pitches", 0],
      },
    });

    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "external",
          pitches: [pitch("F", 3), pitch("A", 3, -1), pitch("C", 4)],
          generatedBy,
        },
        pitchClass("D", -1),
      ).ok,
    ).toBe(true);
    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "external",
          pitches: [pitch("E", 3), pitch("G", 3), pitch("C", 4)],
          generatedBy,
        },
        pitchClass("B", 1),
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.external_bass_included",
        path: ["pitches", 2],
      },
    });
    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "external",
          pitches: [pitch("E", 3)],
          generatedBy,
        },
        null,
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.external_without_slash_bass",
        path: ["bassPolicy"],
      },
    });

    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [pitch("E", -1), pitch("C", -2), pitch("G", -1)],
          generatedBy,
        },
        pitchClass("C"),
      ),
    ).toMatchObject({
      ok: true,
      value: { pitches: [{ step: "E" }, { step: "C" }, { step: "G" }] },
    });

    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [pitch("C", 4)],
          generatedBy: { engineVersion: "\ufeff", family: "shell" },
        },
        null,
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.engine_version_invalid",
        path: ["generatedBy", "engineVersion"],
      },
    });

    const f2OwnedLongVersion = "𝄞".repeat(65);
    expect(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [pitch("C", 4)],
          generatedBy: {
            engineVersion: f2OwnedLongVersion,
            family: "shell",
          },
        },
        null,
      ).ok,
    ).toBe(true);
  });
});

describe("F1 event and Frozen transition construction", () => {
  test("F1-VOICE-014-018 and all 42 Custom+Auto cells prefix refusals transactionally", () => {
    const custom = {
      kind: "custom" as const,
      sourceText: "Stack",
      label: "Stack",
      pitchNames: [pitchClass("C")],
      bass: null,
    };
    let customAutoCells = 0;
    for (const family of autoFamilies) {
      for (const bassPolicy of autoBassPolicies) {
        for (const bass of [null, pitchClass("D", -1)]) {
          customAutoCells += 1;
          expect(
            makeChordEvent({
              id: eventId,
              duration: oneBeat,
              annotation: "",
              chord: { ...custom, bass },
              voicing: {
                mode: "auto",
                family,
                voiceCount: 4,
                range: { lowMidi: 48, highMidi: 84 },
                bassPolicy,
              },
            }),
          ).toMatchObject({
            ok: false,
            refusal: {
              code: "custom.auto_voicing_forbidden",
              path: ["voicing", "mode"],
            },
          });
        }
      }
    }
    expect(customAutoCells).toBe(42);

    expect(
      makeChordEvent({
        id: eventId,
        duration: oneBeat,
        annotation: "",
        chord: { ...custom, pitchNames: [] },
        voicing: {
          mode: "manual",
          pitches: [pitch("C", 4)],
          bassPolicy: "included",
        },
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "custom.pitch_names_empty",
        path: ["chord", "pitchNames"],
      },
    });

    expect(
      makeChordEvent({
        id: eventId,
        duration: oneBeat,
        annotation: "",
        chord: custom,
        voicing: { mode: "manual", pitches: [], bassPolicy: "included" },
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.pitches_empty",
        path: ["voicing", "pitches"],
      },
    });

    const valid = makeChordEvent({
      id: eventId,
      duration: oneBeat,
      annotation: "literal",
      chord: custom,
      voicing: {
        mode: "manual",
        pitches: [pitch("F", 4, 1)],
        bassPolicy: "included",
      },
    });
    expect(valid).toMatchObject({
      ok: true,
      value: { annotation: "literal", chord: { label: "Stack" } },
    });
  });

  test("parsed event construction keeps the voicing matrix and source fields correlated", () => {
    const slashBass = pitchClass("D", -1);
    expect(
      makeChordEvent({
        id: eventId,
        duration: oneBeat,
        annotation: "",
        chord: {
          ...parsedChord(),
          extensions: [degree(9), degree(7)],
        },
        voicing: {
          mode: "auto",
          family: "balanced",
          voiceCount: 4,
          range: { lowMidi: 48, highMidi: 84 },
          bassPolicy: "generated",
        },
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "chord.degree_order",
        path: ["chord", "extensions"],
      },
    });
    expect(
      makeChordEvent({
        id: eventId,
        duration: oneBeat,
        annotation: "",
        chord: parsedChord(),
        voicing: {
          mode: "auto",
          family: "balanced",
          voiceCount: 4,
          range: { lowMidi: -1, highMidi: 84 },
          bassPolicy: "generated",
        },
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "pitch.midi_out_of_range",
        path: ["voicing", "range", "lowMidi"],
      },
    });
    expect(
      makeChordEvent({
        id: eventId,
        duration: oneBeat,
        annotation: "",
        chord: parsedChord(),
        voicing: {
          mode: "frozen",
          pitches: [pitch("C", 4)],
          bassPolicy: "included",
          generatedBy: { engineVersion: "\ufeff", family: "shell" },
        },
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.engine_version_invalid",
        path: ["voicing", "generatedBy", "engineVersion"],
      },
    });

    expect(
      makeChordEvent({
        id: eventId,
        duration: oneBeat,
        annotation: "slash",
        chord: parsedChord(slashBass),
        voicing: {
          mode: "auto",
          family: "balanced",
          voiceCount: 4,
          range: { lowMidi: 48, highMidi: 84 },
          bassPolicy: "none",
        },
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.slash_bass_policy_none",
        path: ["voicing", "bassPolicy"],
      },
    });

    const valid = makeChordEvent({
      id: eventId,
      duration: oneBeat,
      annotation: "slash",
      chord: parsedChord(slashBass),
      voicing: {
        mode: "manual",
        pitches: [pitch("D", 3, -1), pitch("F", 3), pitch("A", 3, -1)],
        bassPolicy: "included",
      },
    });
    expect(valid).toMatchObject({
      ok: true,
      value: {
        id: eventId,
        annotation: "slash",
        chord: { sourceText: "C7/Db", bass: slashBass },
      },
    });
  });

  test("F1-VOICE-024/025 require a complete explicit Frozen-to-Auto request", () => {
    const current: FrozenVoicing = valueOf(
      makeFrozenVoicing(
        {
          mode: "frozen",
          bassPolicy: "included",
          pitches: [pitch("C", 4)],
          generatedBy: { engineVersion: "old-engine", family: "shell" },
        },
        null,
      ),
    );
    expect(
      transitionFrozenToAuto({ current, requestedAuto: null, chordBass: null }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.auto_settings_required",
        path: ["requestedAuto"],
      },
    });

    expect(
      transitionFrozenToAuto({
        current,
        requestedAuto: {
          mode: "auto",
          family: "shell",
          voiceCount: 3,
          range: { lowMidi: 48, highMidi: 84 },
          bassPolicy: "generated",
        },
        chordBass: null,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        mode: "auto",
        family: "shell",
        voiceCount: 3,
        bassPolicy: "generated",
      },
    });

    expect(
      transitionFrozenToAuto({
        current,
        requestedAuto: {
          mode: "auto",
          family: "shell",
          voiceCount: 2,
          range: { lowMidi: 48, highMidi: 84 },
          bassPolicy: "generated",
        },
        chordBass: null,
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.voice_count_invalid",
        path: ["requestedAuto", "voiceCount"],
      },
    });
  });
});
