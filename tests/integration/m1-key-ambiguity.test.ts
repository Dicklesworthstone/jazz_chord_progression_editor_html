import { describe, expect, test } from "bun:test";
import { createStudioComposition } from "../../src/application";
import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import { inferAutomationKey } from "../../src/export/midi-import-automation";
import type { M1ImportOverrides } from "../../src/export";
import { realDecodeFrame } from "../support/midi-import-test-kit";
import { ambiguousKeyMidi } from "../support/midi-key-ambiguity-fixture";
import fixture from "../fixtures/midi-import-automation/key-ambiguity-cases.json";

const automatic: M1ImportOverrides = { excludedTrackIndices: [], alternativeChoices: [], grooveStyleId: null };
function controller() {
  const result = createStudioComposition();
  if (!result.ok) throw new Error(result.refusal.code);
  return { ...result.composition.controller, getDocument: () => result.composition.readApplicationState().document };
}

describe("M1 key ambiguity through production inference, decoder and controller", () => {
  test("full evidence matches independent fixture values in all rotations and inverses", () => {
    for (const kase of fixture.cases) {
      for (let shift = 0; shift < 12; shift++) {
        const masses = Array.from({ length: 12 }, (_, pc) => kase.masses[(pc - shift + 12) % 12] ?? 0);
        const inferred = inferAutomationKey(masses);
        if (kase.score === null) { expect(inferred).toBeNull(); continue; }
        const expected = kase.tiedKeys.map((key) => ({ ...key, tonicPitchClass: (key.tonicPitchClass + shift) % 12 }))
          .sort((a, b) => (a.mode === b.mode ? 0 : a.mode === "major" ? -1 : 1) || a.tonicPitchClass - b.tonicPitchClass);
        expect(JSON.stringify(inferred?.tiedKeys)).toBe(JSON.stringify(expected));
        expect(inferred?.score).toBe(kase.score);
        expect(inferred?.runnerUpScore).toBe(kase.runnerUpScore);
        expect<number | undefined>(inferred?.tonicPitchClass).toBe(expected[0]?.tonicPitchClass);
        expect(Object.isFrozen(inferred?.tiedKeys)).toBe(true);
        expect(JSON.stringify(inferAutomationKey(Array.from({ length: 12 }, (_, pc) => masses[(pc + shift) % 12] ?? 0))?.tiedKeys)).toBe(JSON.stringify(kase.tiedKeys));
      }
    }
  });

  test("ambiguous input withholds key; explicit choice, clear and invalid choice preserve evidence", async () => {
    const service = createStudioMidiImport(realDecodeFrame);
    const preview = await service.readFile("Symmetric.mid", ambiguousKeyMidi());
    expect(preview.refusal).toBeNull();
    expect(JSON.stringify(preview.automation?.key?.tiedKeys)).toBe(JSON.stringify([0, 3, 6, 9].map((tonicPitchClass) => ({ tonicPitchClass, mode: "minor" }))));
    expect(preview.automation?.keySelection).toBeNull();
    expect(preview.automation?.keySpelled).toBeNull();
    for (let shift = 0; shift < 12; shift++) {
      const rotated = await service.readFile("Rotated.mid", ambiguousKeyMidi(shift));
      expect(JSON.stringify(rotated.automation?.key?.tiedKeys)).toBe(JSON.stringify([0, 3, 6, 9].map((pc) => (pc + shift) % 12).sort((a, b) => a - b).map((tonicPitchClass) => ({ tonicPitchClass, mode: "minor" }))));
      expect(rotated.automation?.keySelection).toBeNull();
      expect(rotated.automation?.writtenChordCount).toBe(2);
    }
    const chosen = service.replanWithOverrides(preview, { ...automatic, key: { tonicPitchClass: 6, mode: "major" } });
    expect(chosen.automation?.keySelection).toEqual({ tonicPitchClass: 6, mode: "major" });
    expect(chosen.automation?.keySelectionSource).toBe("override");
    expect(chosen.automation?.key).toEqual(preview.automation?.key);
    const cleared = service.replanWithOverrides(chosen, automatic);
    expect(cleared.automation).toEqual(preview.automation);
    const invalid = service.replanWithOverrides(chosen, { ...automatic, key: { tonicPitchClass: 12, mode: "major" } } as unknown as M1ImportOverrides);
    expect(invalid.automation?.keySelection).toBeNull();
    expect(JSON.stringify(invalid.trace)).toContain("invalid-key-override");
    for (const candidate of [preview, chosen]) {
      const studio = controller();
      const before = studio.getDocument();
      const result = service.commitAutomatic(studio, candidate);
      expect(result.committed).toBe(true);
      expect(result.steps.find((step) => step.step === "key")?.outcome).toBe(candidate === preview ? "withheld" : "applied");
      for (let undo = 0; undo < result.undoCount; undo++) studio.undo();
      expect(studio.getDocument()).toEqual(before);
    }
    const occupied = controller();
    expect(service.commitAutomatic(occupied, chosen).committed).toBe(true);
    const before = occupied.getDocument();
    const anotherChoice = service.replanWithOverrides(preview, { ...automatic, key: { tonicPitchClass: 2, mode: "minor" } });
    const result = service.commitAutomatic(occupied, anotherChoice);
    expect(result.steps.find((step) => step.step === "key")?.outcome).toBe("withheld");
    for (let undo = 0; undo < result.undoCount; undo++) occupied.undo();
    expect(occupied.getDocument()).toEqual(before);
  });
});
