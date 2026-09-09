/** Independent amendment #3 reference. No production imports or inferred goldens. */
export type Key = Readonly<{ tonicPitchClass: number; mode: "major" | "minor" }>;
type Evidence = Readonly<{
  score: number | null;
  runnerUpScore: number | null;
  tiedKeys: readonly Key[];
}>;
export type KeyAmbiguityFamily = Readonly<{
  cases: readonly (Evidence & Readonly<{ name: string; masses: readonly number[] }>)[];
}>;

const PROFILES = [
  ["major", [8, 0, 3, 0, 6, 5, 0, 7, 0, 4, 1, 3]],
  ["minor", [8, 0, 3, 6, 0, 5, 0, 7, 2, 3, 5, 1]],
] as const;
const order = (a: Key, b: Key): number =>
  (a.mode === b.mode ? 0 : a.mode === "major" ? -1 : 1) ||
  a.tonicPitchClass - b.tonicPitchClass;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const rotate = (masses: readonly number[], shift: number): number[] =>
  Array.from({ length: 12 }, (_, pc) => masses[(pc - shift + 12) % 12] ?? 0);
const rotateKeys = (keys: readonly Key[], shift: number): Key[] =>
  keys.map((key) => ({ ...key, tonicPitchClass: (key.tonicPitchClass + shift) % 12 })).sort(order);

/** Deliberately enumerate and sort all scores instead of streaming a winner. */
export function referenceKeyEvidence(masses: readonly number[]): Evidence {
  if (masses.length !== 12 || masses.some((mass) => !Number.isSafeInteger(mass) || mass < 0)) {
    throw new Error("Key fixture requires twelve nonnegative safe integers");
  }
  if (masses.every((mass) => mass === 0)) return { score: null, runnerUpScore: null, tiedKeys: [] };
  const scores = PROFILES.flatMap(([mode, profile]) =>
    Array.from({ length: 12 }, (_, tonicPitchClass) => ({
      tonicPitchClass, mode,
      score: profile.reduce<number>((sum, weight, offset) =>
        sum + weight * (masses[(tonicPitchClass + offset) % 12] ?? 0), 0),
    })),
  ).sort((a, b) => b.score - a.score || order(a, b));
  const score = scores[0]?.score ?? null;
  return {
    score, runnerUpScore: scores[1]?.score ?? null,
    tiedKeys: scores.filter((candidate) => candidate.score === score)
      .map(({ tonicPitchClass, mode }) => ({ tonicPitchClass, mode })),
  };
}

export function referenceKeySelection(evidence: Evidence, override: unknown): Readonly<{
  selected: Key | null; source: "inferred" | "override" | "none"; invalidOverride: boolean;
}> {
  const pc: unknown = typeof override === "object" && override !== null
    ? Reflect.get(override, "tonicPitchClass") : undefined;
  const mode: unknown = typeof override === "object" && override !== null
    ? Reflect.get(override, "mode") : undefined;
  if (typeof pc === "number" && Number.isInteger(pc) && pc >= 0 && pc < 12 &&
      (mode === "major" || mode === "minor")) {
    return { selected: { tonicPitchClass: pc, mode }, source: "override", invalidOverride: false };
  }
  const selected = evidence.tiedKeys.length === 1 ? evidence.tiedKeys[0] ?? null : null;
  return {
    selected, source: selected === null ? "none" : "inferred",
    invalidOverride: override !== null && override !== undefined,
  };
}

export function checkKeyAmbiguity(data: KeyAmbiguityFamily): readonly string[] {
  const findings: string[] = [];
  for (const kase of data.cases) {
    const expected = { score: kase.score, runnerUpScore: kase.runnerUpScore, tiedKeys: kase.tiedKeys };
    const actual = referenceKeyEvidence(kase.masses);
    if (!same(actual, expected)) findings.push(`${kase.name}: full evidence differs`);
    for (let shift = 0; shift < 12; shift += 1) {
      const masses = rotate(kase.masses, shift);
      const rotated = referenceKeyEvidence(masses);
      const wanted = { ...expected, tiedKeys: rotateKeys(kase.tiedKeys, shift) };
      if (!same(rotated, wanted)) findings.push(`${kase.name}: rotation ${String(shift)}`);
      if (!same(referenceKeyEvidence(rotate(masses, (12 - shift) % 12)), expected)) {
        findings.push(`${kase.name}: inverse ${String(shift)}`);
      }
      const selected = referenceKeySelection(rotated, null);
      const wantedSelection = wanted.tiedKeys.length === 1 ? wanted.tiedKeys[0] : null;
      if (!same(selected.selected, wantedSelection)) findings.push(`${kase.name}: automatic selection`);
      for (const mode of ["major", "minor"] as const) {
        for (let tonicPitchClass = 0; tonicPitchClass < 12; tonicPitchClass += 1) {
          const key = { tonicPitchClass, mode };
          if (!same(referenceKeySelection(rotated, key), { selected: key, source: "override", invalidOverride: false })) {
            findings.push(`${kase.name}: explicit override`);
          }
        }
      }
      for (const invalid of [false, 0, "C", {}, { tonicPitchClass: -1, mode: "major" },
        { tonicPitchClass: 12, mode: "minor" }, { tonicPitchClass: 0.5, mode: "major" },
        { tonicPitchClass: 0, mode: "dorian" }]) {
        if (!same(referenceKeySelection(rotated, invalid), { ...selected, invalidOverride: true })) {
          findings.push(`${kase.name}: invalid override must drop without repair`);
        }
      }
    }
  }
  return findings;
}
