import { expect, test } from "bun:test";
import { semanticSurfacePacket, validateSemanticSurfaceDeclarations,
  validateSemanticSurfacePacket } from "../../scripts/validate-semantic-surface-conformance-contract";

test("independent semantic packet and declared source/fixture owners are complete", async () => {
  expect(validateSemanticSurfacePacket(semanticSurfacePacket)).toEqual([]);
  expect(await validateSemanticSurfaceDeclarations()).toEqual([]);
});

for (const key of Object.keys(semanticSurfacePacket)) {
  test(`unknown ${key} schema is rejected`, () => {
    const changed: Record<string, unknown> = structuredClone(semanticSurfacePacket);
    changed[key] = { schema: "unknown.v999" };
    expect(validateSemanticSurfacePacket(changed)).toEqual(["SS_SCHEMA"]);
  });
}

for (const invalid of [null, false, 0, "packet", [], {}, { contract: {} }]) {
  test(`malformed packet ${JSON.stringify(invalid)} cannot pass`, () => {
    expect(validateSemanticSurfacePacket(invalid).length).toBeGreaterThan(0);
  });
}

test("the starter counterexample retains double-sharp spelling and both tied major readings", () => {
  const starter = semanticSurfacePacket.laws.containmentCases.find(row => row.id === "SS-STARTER-COUNTEREXAMPLE");
  expect(starter).toBeDefined();
  if (starter === undefined) throw new Error("Missing independent starter example");
  expect(starter).toMatchObject({ toneOccurrences: 17, pitchClassMatches: 14, spellingMatches: 12,
    outsidePitchClasses: [3, 8, 10], bestMajorTonics: [0, 7], completePitchClassContainment: false,
    completeSpelledContainment: false, keyMayBePersisted: false });
  const names = starter.chords.flatMap(id => {
    const chord = semanticSurfacePacket.laws.chords.find(row => row.id === id);
    if (chord === undefined) throw new Error(`Missing fixture chord ${id}`);
    return chord.spellings;
  });
  expect(names.filter(name => name === "F##")).toHaveLength(2);
  expect(names.filter(name => ["Eb", "Bb", "G#"].includes(name)).sort()).toEqual(["Bb", "Eb", "G#"]);
});

test("bit-mask membership independently checks each context in all twelve transpositions", () => {
  // Chromatic C-major membership, authored directly as bits B A G F E D C.
  const scaleMask = 0b101010110101;
  for (const fixture of semanticSurfacePacket.laws.containmentCases) {
    const pitches = fixture.chords.flatMap(id => {
      const chord = semanticSurfacePacket.laws.chords.find(row => row.id === id);
      if (chord === undefined) throw new Error(`Missing fixture chord ${id}`);
      return chord.pitchClasses;
    });
    for (let shift = 0; shift < 12; shift += 1) {
      const rotated = ((scaleMask << shift) | (scaleMask >>> (12 - shift))) & 4095;
      expect(pitches.filter(pitch => (rotated & (1 << ((pitch + shift) % 12))) !== 0)).toHaveLength(fixture.pitchClassMatches);
    }
  }
});

test("odd-meter split uses exact twelfths and stored voices retain both unisons", () => {
  const timeline = semanticSurfacePacket.laws.exactTimeline;
  const ticks = (pairs: number[][]): number => pairs.reduce((total, [n, d]) => {
    if (n === undefined || d === undefined || 12 % d !== 0) throw new Error("Fixture is not exactly representable in twelfths");
    return total + n * (12 / d);
  }, 0);
  expect(ticks(timeline.sourceDurations)).toBe(42);
  expect(ticks(timeline.splitDurations)).toBe(42);
  expect(semanticSurfacePacket.laws.storedVoices.midi).toEqual([59, 60, 60, 63, 66, 67, 70, 72, 73, 76, 77, 80, 81, 83, 84, 85]);
});

for (const edge of semanticSurfacePacket.limits.boundaries) {
  test(`${edge.key} cannot expand its accepted ceiling`, () => {
    const changed = structuredClone(semanticSurfacePacket);
    const row = changed.limits.boundaries.find(value => value.key === edge.key);
    if (row === undefined) throw new Error("Missing limit fixture");
    row.maximum += 1;
    expect(validateSemanticSurfacePacket(changed)).toEqual(["SS_LIMIT_EDGE"]);
  });
}

const mutationCodes: Readonly<Record<string, string>> = {
  "absent-call": "H0_REAL_OPERATIONS", "no-op-call": "ACTUAL_DISPATCH_EVIDENCE",
  "wrong-engine": "NATIVE_BASELINE_ENGINE", "discarded-result": "ACTUAL_DISPATCH_EVIDENCE",
  "fabricated-dispatch": "DISPATCH_AUTHORITY", "wrong-selection": "SELECTED_REALIZATION",
  "stale-revision": "TRANSACTION_LAW", "invented-duration": "EXACT_TIME_SUM",
  "normalized-spelling": "INDEPENDENT_DEGREE_ARITHMETIC", "dropped-unison": "EXACT_VOICE_OWNERSHIP",
  "fabricated-counter": "ACTUAL_DISPATCH_EVIDENCE", "false-containment": "CONTAINMENT_TRUTH",
  "lost-counterevidence": "CONTAINMENT_COUNTEREVIDENCE", "hidden-context-barrier": "BARRIER_NOT_SKIPPED",
  "stale-bridge-bundle": "BRIDGE_AUTHORITY", "header-only-midi": "REAL_DOWNLOAD_SEMANTICS",
};
const targets: Readonly<Record<string, keyof typeof semanticSurfacePacket>> = {
  "operation-inventory.json": "inventory", "law-cases.json": "laws", "trace-ledger.json": "traces",
};
function mutateAtPath(value: unknown, path: readonly (string | number)[], replacement: unknown): void {
  const [first, ...rest] = path;
  if (first === undefined || value === null || typeof value !== "object" || !Object.hasOwn(value, first)) {
    throw new Error("Mutation must replace an existing fixture field");
  }
  const container = value as Record<string | number, unknown>;
  if (rest.length === 0) container[first] = structuredClone(replacement);
  else mutateAtPath(container[first], rest, replacement);
}

for (const control of semanticSurfacePacket.mutations.controls) {
  test(`fixture fault ${control.id} fails its intended semantic assertion`, () => {
    expect(validateSemanticSurfacePacket(semanticSurfacePacket)).toEqual([]);
    const changed = structuredClone(semanticSurfacePacket), target = targets[control.target], code = mutationCodes[control.id];
    if (target === undefined || code === undefined) throw new Error("Undeclared mutation control");
    mutateAtPath(changed[target], control.path, control.replacement);
    expect(changed).not.toEqual(semanticSurfacePacket);
    expect(validateSemanticSurfacePacket(changed)).toEqual([`SS_${code}`]);
  });
}

test("every declared control runs once and cannot substitute for later production faults", () => {
  expect(Object.keys(mutationCodes)).toEqual(semanticSurfacePacket.mutations.controls.map(row => row.id));
  expect(semanticSurfacePacket.mutations.fixtureMutationDoesNotProveProduction).toBe(true);
  expect(semanticSurfacePacket.mutations.sourceMutantsRequiredInBuildAndProof).toBe(true);
});

test("empty provenance cannot silently waive original engine and human gates", () => {
  const changed = structuredClone(semanticSurfacePacket);
  Object.assign(changed.provenance, { corpusRules: {}, proofBoundaries: {} });
  expect(validateSemanticSurfacePacket(changed)).toEqual(["SS_UPSTREAM_PROOF_BOUNDARIES"]);
});
