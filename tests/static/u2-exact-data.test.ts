import { describe, expect, test } from "bun:test";
import {
  makeAutoVoicing, makeFrozenVoicing, makeManualVoicing, makeSpelledPitch,
  projectSpelledPitch,
} from "../../src/domain";
import { U2_EXPECTED_COMPANIONS, validateU2Semantics } from "../../scripts/validate-u2-contract";
import exact from "../fixtures/chord-inspector/exact-note-cases.json";
import policies from "../fixtures/chord-inspector/auto-policy-cases.json";
import annotations from "../fixtures/chord-inspector/annotation-cases.json";
import inspector from "../fixtures/chord-inspector/inspector-cases.json";
import piano from "../fixtures/chord-inspector/piano-cases.json";
import manifest from "../fixtures/chord-inspector/u2-chord-inspector-contract.json";
import transitions from "../fixtures/chord-inspector/voicing-transition-cases.json";
import mutations from "../fixtures/chord-inspector/mutation-controls.json";
import traces from "../fixtures/chord-inspector/trace-ledger.json";
import provenance from "../fixtures/chord-inspector/provenance-ledger.json";

const packet = {
  "u2-chord-inspector-contract.json": manifest,
  "exact-note-cases.json": exact, "auto-policy-cases.json": policies,
  "annotation-cases.json": annotations, "inspector-cases.json": inspector,
  "piano-cases.json": piano, "voicing-transition-cases.json": transitions,
  "mutation-controls.json": mutations, "trace-ledger.json": traces,
  "provenance-ledger.json": provenance,
};

describe("U2 independent exact-data packet", () => {
  test("all companions receive semantic checks without relying on digests", () => {
    expect(Object.keys(packet).sort()).toEqual([...U2_EXPECTED_COMPANIONS, "u2-chord-inspector-contract.json"].sort());
    expect(validateU2Semantics(packet)).toEqual([]);
  });

  for (const scenario of exact.cases) test(scenario.id, () => {
    const pitches = scenario.pitches.map(input => {
      const result = makeSpelledPitch(input);
      if (!result.ok) throw new Error(JSON.stringify(result.refusal));
      return result.value;
    });
    const stored = scenario.mode === "manual"
      ? makeManualVoicing({ mode: "manual", pitches, bassPolicy: "included" }, null)
      : makeFrozenVoicing({ mode: "frozen", pitches, bassPolicy: "included",
        generatedBy: { engineVersion: "fixture-v0-1", family: "balanced" } }, null);
    if (!stored.ok) {
      expect(scenario.expected.ok).toBe(false);
      expect(scenario.expected.code).toBe(stored.refusal.code);
      return;
    }
    const projections = stored.value.pitches.map(projectSpelledPitch);
    const refusal = projections.find(result => !result.ok);
    if (refusal !== undefined) {
      expect(scenario.expected.ok).toBe(false);
      expect(scenario.expected.code).toBe(refusal.refusal.code);
      return;
    }
    expect(scenario.expected.ok).toBe(true);
    expect(scenario.expected.pitches).toEqual([...stored.value.pitches]);
    expect(scenario.expected.midi).toEqual(projections.map(result => {
      if (!result.ok) throw new Error("Unexpected MIDI projection refusal");
      return result.value.midi;
    }));
  });

  for (const family of ["balanced", "shell", "rootless-a", "rootless-b", "open", "drop2", "quartal"] as const) {
    for (const bassPolicy of ["generated", "external", "none"] as const) test(`${family}/${bassPolicy}`, () => {
      const scenario = policies.cases.find(row => row.policy.family === family && row.policy.bassPolicy === bassPolicy);
      if (!scenario) throw new Error("Missing independent family/bass scenario");
      const result = makeAutoVoicing({ mode: "auto", family, bassPolicy, voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 } }, null);
      expect(result.ok).toBe(scenario.expected.ok);
      if (!result.ok) expect(scenario.expected.code).toBe(result.refusal.code);
    });
  }

  test("semantic checks reject sorted/deduplicated expected notes without digest checks", () => {
    for (const transform of [
      (pitches: typeof exact.cases[0]["pitches"]) => [...pitches].reverse(),
      (pitches: typeof exact.cases[0]["pitches"]) => pitches.filter((_, index) => index !== 2),
    ]) {
      const changed = structuredClone(packet);
      const row = changed["exact-note-cases.json"].cases[0];
      if (!row) throw new Error("Missing16-note positive control");
      row.expected.pitches = transform(row.pitches);
      expect(validateU2Semantics(changed).some(f => f.code === "U2_EXACT_PITCHES_CHANGED")).toBe(true);
    }
  });

  test("semantic checks reject annotation stripping and UTF-16 counts", () => {
    const stripped = structuredClone(packet);
    const raw = stripped["annotation-cases.json"].cases[1];
    if (!raw) throw new Error("Missing literal-markup control");
    raw.expected.text = "stripped";
    expect(validateU2Semantics(stripped).some(f => f.code === "U2_ANNOTATION_SOURCE_CHANGED")).toBe(true);
    const utf16 = structuredClone(packet);
    const astral = utf16["annotation-cases.json"].cases[5];
    if (!astral) throw new Error("Missing astral boundary control");
    astral.expected.codePoints = astral.rawInput.length;
    expect(validateU2Semantics(utf16).some(f => f.path === "U2-NOTE-006.codePoints")).toBe(true);
  });

  test("semantic checks reject a wrong pitch class and rootless bass tuple", () => {
    const changed = structuredClone(packet);
    const key = changed["piano-cases.json"].cases[2]?.expectedKeyRoles?.[2];
    const auto = changed["auto-policy-cases.json"].cases[6];
    if (!key || !auto) throw new Error("Missing arithmetic/policy controls");
    key.pitchClass = 0; auto.expected.ok = true;
    const findings = validateU2Semantics(changed);
    expect(findings.some(f => f.code === "U2_PITCH_ARITHMETIC_INVALID")).toBe(true);
    expect(findings.some(f => f.code === "U2_AUTO_POLICY_INVALID")).toBe(true);
  });
});
