/**
 * The effective auto-voicing law (jcpe-altered-dominant-voicing-1zh8).
 *
 * Every expectation is hand-authored from chord spelling, never read back
 * from the engine: a written alteration is a semitone offset above the root
 * that the sounding voicing must contain. Positive cases span all twelve
 * roots (transposition), near-misses show ordinary chords keep their stored
 * note count, negative controls show non-adaptive families and non-effective
 * bindings still refuse, and MIDI export shares the same law.
 */
import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { createStudioMidiExport } from "../../src/application/studio-midi-export";
import { buildStudioRealizations } from "../../src/application/studio-realization";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import type { AutoVoicing, ValidatedDocument } from "../../src/domain";
import {
  PLAYBACK_ARTICULATION_POLICY_ID,
  PLAYBACK_ARTICULATION_POLICY_VERSION,
  PLAYBACK_LOOP_POLICY_ID,
  PLAYBACK_LOOP_POLICY_VERSION,
  PLAYBACK_PLAN_COMPILER_ID,
  PLAYBACK_PLAN_COMPILER_VERSION,
  PLAYBACK_PLAN_REQUEST_SCHEMA,
  PLAYBACK_REALIZATION_BINDING_POLICY_ID,
  PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
  PLAYBACK_VELOCITY_POLICY_ID,
  PLAYBACK_VELOCITY_POLICY_VERSION,
  compilePlaybackPlan,
} from "../../src/playback";
import {
  effectiveAutoVoicing,
  parseChordSymbol,
  resolveChord,
} from "../../src/theory";
import { musicalDocument } from "../support/studio-voice-leading";

const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const ROOT_PC: Readonly<Record<(typeof ROOTS)[number], number>> = {
  C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11,
};

/* Suffix → semitone offsets above the root that must sound. Every dominant
 * needs its 3 (4) and ♭7 (10). "alt" admits either altered fifth (♭5 = 6,
 * ♯5 = 8) and either altered ninth (♭9 = 1, ♯9 = 3). */
const ALTERED: readonly Readonly<{ suffix: string; required: readonly (readonly number[])[] }>[] = [
  { suffix: "7alt", required: [[4], [10], [6, 8], [1, 3]] },
  { suffix: "alt", required: [[4], [10], [6, 8], [1, 3]] },
  { suffix: "7#5#9", required: [[4], [10], [8], [3]] },
  { suffix: "7b9b13", required: [[4], [10], [1], [8]] },
  { suffix: "7b9#11", required: [[4], [10], [1], [6]] },
  { suffix: "13b9", required: [[4], [10], [1], [9]] },
  { suffix: "13#11", required: [[4], [10], [6], [9]] },
  { suffix: "9#11", required: [[4], [10], [2], [6]] },
];

const BALANCED_4: AutoVoicing = Object.freeze({
  mode: "auto", family: "balanced", voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }), bassPolicy: "generated",
}) as AutoVoicing;

function realizationOf(symbol: string) {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error(`test symbol did not parse: ${symbol}`);
  const resolved = resolveChord(parsed.chord);
  if (!resolved.ok) throw new Error(`test symbol did not resolve: ${symbol}`);
  return resolved.value.realizations[0];
}

function soundingPitchClasses(document: ValidatedDocument, eventIndex: number): Set<number> {
  const compiled = compileStudioPlaybackPlan(document);
  if (!compiled.ok) {
    throw new Error(`${compiled.refusal.code}: ${compiled.refusal.message}`);
  }
  const event = compiled.plan.events[eventIndex];
  if (event === undefined) throw new Error("missing compiled event");
  return new Set(event.midiPitches.map((midi) => midi % 12));
}

describe("effectiveAutoVoicing law", () => {
  test("adaptive families widen just enough for every mandatory degree", () => {
    expect(effectiveAutoVoicing(realizationOf("G7alt"), BALANCED_4).voiceCount).toBe(5);
    expect(effectiveAutoVoicing(realizationOf("G7alt"), { ...BALANCED_4, family: "open" }).voiceCount).toBe(5);
    expect(effectiveAutoVoicing(realizationOf("G7b9b13"), BALANCED_4).voiceCount).toBe(5);
  });

  test("near-miss: chords that fit keep the stored policy object unchanged", () => {
    for (const symbol of ["G7", "G7b9", "G13", "Cmaj7", "Dm7", "C6/9", "Bm7b5", "Cdim7"]) {
      expect(effectiveAutoVoicing(realizationOf(symbol), BALANCED_4)).toBe(BALANCED_4);
    }
    /* A larger stored count is never reduced. */
    const six = Object.freeze({ ...BALANCED_4, voiceCount: 6 }) as AutoVoicing;
    expect(effectiveAutoVoicing(realizationOf("G7alt"), six)).toBe(six);
  });

  test("fixed-template families are never widened", () => {
    for (const family of ["shell", "rootless-a", "rootless-b", "drop2"] as const) {
      const policy = Object.freeze({ ...BALANCED_4, family }) as AutoVoicing;
      expect(effectiveAutoVoicing(realizationOf("G7alt"), policy)).toBe(policy);
    }
  });
});

describe("altered dominants play in every key", () => {
  for (const { suffix, required } of ALTERED) {
    test(`${suffix}: all twelve roots sound 3, ♭7 and every written alteration`, () => {
      for (const root of ROOTS) {
        const symbol = `${root}${suffix}`;
        const sounding = soundingPitchClasses(musicalDocument([["Dm7"], [symbol], ["Cmaj7"]]), 1);
        for (const choices of required) {
          const found = choices.some((offset) => sounding.has((ROOT_PC[root] + offset) % 12));
          expect(found ? null : `${symbol} is missing one of +${choices.join("/+")}`).toBeNull();
        }
      }
      /* Twelve whole-chart compiles; wall time is not a musical bound. */
    }, 180_000);
  }

  test("near-miss: an ordinary dominant still sounds exactly four notes", () => {
    const compiled = compileStudioPlaybackPlan(musicalDocument([["G7"], ["Cmaj7"]]));
    if (!compiled.ok) throw new Error(compiled.refusal.code);
    expect(compiled.plan.events.map((event) => event.midiPitches.length)).toEqual([4, 4]);
  });

  test("negative: a fixed rootless template that lacks the alterations still refuses", () => {
    /* Rootless-A's printed rows have no altered-fifth/ninth slots, and fixed
     * families are never widened, so V0's refusal must reach playback. (Shell
     * is a deliberate omission template and does realize 3-♭7 shells.) */
    const rootless = { mode: "auto", family: "rootless-a", voiceCount: 4,
      range: { lowMidi: 48, highMidi: 84 }, bassPolicy: "external" };
    const compiled = compileStudioPlaybackPlan(musicalDocument([["Dm7"], ["G7alt"]], rootless));
    expect(compiled.ok).toBe(false);
  });

  test("negative: P0 still refuses a binding for any policy other than the effective one", () => {
    const document = musicalDocument([["G7alt"]]);
    const built = buildStudioRealizations(document);
    if (!built.ok) throw new Error(built.refusal.code);
    const [eventId, binding] = [...built.realizations.entries()][0] ?? [];
    if (eventId === undefined || binding?.kind !== "generated") throw new Error("expected generated binding");
    expect(binding.request.policy.voiceCount).toBe(5);
    const tampered = new Map(built.realizations);
    tampered.set(eventId, Object.freeze({
      ...binding,
      request: Object.freeze({
        ...binding.request,
        policy: Object.freeze({ ...binding.request.policy, voiceCount: 6 }),
      }),
    }) as typeof binding);
    const compiled = compilePlaybackPlan({
      schema: PLAYBACK_PLAN_REQUEST_SCHEMA,
      compilerId: PLAYBACK_PLAN_COMPILER_ID,
      compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
      articulationPolicyId: PLAYBACK_ARTICULATION_POLICY_ID,
      articulationPolicyVersion: PLAYBACK_ARTICULATION_POLICY_VERSION,
      loopPolicyId: PLAYBACK_LOOP_POLICY_ID,
      loopPolicyVersion: PLAYBACK_LOOP_POLICY_VERSION,
      velocityPolicyId: PLAYBACK_VELOCITY_POLICY_ID,
      velocityPolicyVersion: PLAYBACK_VELOCITY_POLICY_VERSION,
      realizationBindingPolicyId: PLAYBACK_REALIZATION_BINDING_POLICY_ID,
      realizationBindingPolicyVersion: PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
      document,
      realizedVoicings: tampered,
      loop: null,
    });
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.refusal.code).toBe("playback.realization_source_voicing_stale");
  });
});

describe("MIDI export shares the law", () => {
  test("a chart with G7alt is ready to export, not blocked", async () => {
    const document = musicalDocument([["Dm7b5", "G7alt"], ["Cm6"]]);
    const binding = Object.freeze({ documentId: document.id, revision: 1 });
    const service = createStudioMidiExport({
      readDocument: () => document,
      readBinding: () => binding,
      hashBytes: (bytes) => Promise.resolve(createHash("sha256").update(bytes).digest("hex")),
      startDelivery: () => Object.freeze({
        completion: Promise.resolve(Object.freeze({
          objectUrlsCreated: 1, objectUrlsRevoked: 1, outstandingOwnedResources: 0,
        })),
      }),
    });
    const preview = await service.openPreview();
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.blockers).toEqual([]);
    expect(preview.preview.readiness).toBe("ready");
  });
});
