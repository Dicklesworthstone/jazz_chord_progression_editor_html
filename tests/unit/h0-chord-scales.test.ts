/**
 * enumerateChordScaleOptions replayed against the independently authored H0
 * fixtures (tests/fixtures/harmony-analysis/chord-scale-cases.json): every
 * seed case, every declaration case, and the 312-cell all-root expansion.
 *
 * Inputs are built from the catalog's chord symbols through the real parser
 * and T1 resolver; expectations come only from the fixture rows. Transposed
 * inputs go through the parser-verified spelled transposer and the fixture's
 * own spelled roots, never through the operation under test.
 */
import { describe, expect, test } from "bun:test";
import {
  H0_ANALYSIS_RULE_TABLE_ID,
  H0_ANALYSIS_RULE_TABLE_VERSION,
  H0_CHORD_SCALE_MAPPING_TABLE_ID,
  H0_CHORD_SCALE_MAPPING_TABLE_VERSION,
  enumerateChordScaleOptions,
  parseChordSymbol,
  resolveChord,
  transposeChordSpecByInterval,
  type H0ChordScaleRequest,
  type H0ChordScaleResult,
  type H0DeclaredSpanKind,
  type H0SelectedRealizationId,
} from "../../src/theory";
import { intervalBetweenTonics } from "../../src/application/chart-transposition";
import { parseStableId, type ChordDegree, type ChordSpec, type KeyContext, type SpelledPitchClass } from "../../src/domain";
import sources from "../fixtures/harmony-analysis/source-catalog.json";
import scaleCases from "../fixtures/harmony-analysis/chord-scale-cases.json";

const eventId = (wire: string) => {
  const parsed = parseStableId("event", wire);
  if (!parsed.ok) throw new Error(wire);
  return parsed.value;
};

const token = (degree: ChordDegree): string =>
  `${degree.alter < 0 ? "b".repeat(-degree.alter) : "#".repeat(degree.alter)}${String(degree.number)}`;

type Frame = Readonly<{ key: KeyContext | null; declaredSpan: H0DeclaredSpanKind }>;

function frameFor(contextId: string | undefined): Frame {
  if (contextId === undefined) return { key: null, declaredSpan: "unspecified" };
  const context = sources.contexts.find((row) => row.id === contextId);
  if (context === undefined) throw new Error(contextId);
  if (context.basis === "declared-key" && "mode" in context && "tonicSpelling" in context) {
    return { key: { tonic: context.tonicSpelling as SpelledPitchClass, mode: context.mode as KeyContext["mode"] }, declaredSpan: "tonal" };
  }
  if (context.basis === "declared-modal") return { key: null, declaredSpan: "modal" };
  if (context.basis === "declared-nonfunctional") return { key: null, declaredSpan: "nonfunctional" };
  return { key: null, declaredSpan: "unspecified" };
}

function chordSpec(symbol: string): ChordSpec {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error(`parse ${symbol}`);
  return parsed.chord;
}

function build(
  spec: ChordSpec,
  frame: Frame,
  selectedRealizationId: H0SelectedRealizationId | null,
  declaredScaleContext: unknown,
): H0ChordScaleRequest {
  const resolved = resolveChord(spec);
  if (!resolved.ok) throw new Error(`resolve ${spec.sourceText}`);
  return {
    requestId: "scale-test", baseRevision: 7, key: frame.key, declaredSpan: frame.declaredSpan,
    previous: null, current: { eventId: eventId("current"), resolved: resolved.value, selectedRealizationId }, next: null,
    analysisRuleTable: { id: H0_ANALYSIS_RULE_TABLE_ID, version: H0_ANALYSIS_RULE_TABLE_VERSION },
    chordScaleMappingTable: { id: H0_CHORD_SCALE_MAPPING_TABLE_ID, version: H0_CHORD_SCALE_MAPPING_TABLE_VERSION },
    declaredScaleContext: declaredScaleContext as H0ChordScaleRequest["declaredScaleContext"],
  };
}

function sourceSymbol(sourceId: string): Readonly<{ symbol: string; realizationId: string | null }> {
  const source = sources.chords.find((row) => row.id === sourceId);
  if (source === undefined) throw new Error(sourceId);
  return { symbol: source.symbol, realizationId: source.realizationId };
}

type SeedCase = (typeof scaleCases.cases)[number];

function requestForCase(seed: SeedCase): H0ChordScaleRequest {
  const source = sourceSymbol(seed.sourceId);
  const selection = "selectedRealizationId" in seed
    ? (seed.selectedRealizationId as H0SelectedRealizationId | null)
    : source.realizationId === "literal" ? "literal" : null;
  const declaration = "declaredScaleContext" in seed ? seed.declaredScaleContext : null;
  return build(chordSpec(source.symbol), frameFor("contextId" in seed ? seed.contextId : undefined), selection, declaration);
}

function options(result: H0ChordScaleResult) {
  if (!result.ok) throw new Error(`refused ${result.refusal.code}`);
  return result.value.options;
}

describe("independent chord-scale cases", () => {
  for (const seed of scaleCases.cases) {
    test(seed.id, () => {
      const request = requestForCase(seed);
      const before = JSON.stringify(request);
      const result = enumerateChordScaleOptions(request);
      // Inputs are never mutated, and the same input replays byte-identically.
      expect(JSON.stringify(request)).toBe(before);
      expect(JSON.stringify(enumerateChordScaleOptions(request))).toBe(JSON.stringify(result));
      const expected = seed.expected as Record<string, unknown>;
      if ("refusal" in expected) {
        expect(result.ok ? "ok" : result.refusal.code).toBe((expected.refusal as { code: string }).code);
        return;
      }
      const found = options(result);
      if ("orderedOptions" in expected) {
        const wanted = expected.orderedOptions as readonly Record<string, unknown>[];
        expect(found.map((option) => option.family)).toEqual(wanted.map((row) => row.family));
        wanted.forEach((row, index) => {
          const option = found[index];
          if (option === undefined) throw new Error("missing option");
          if ("mappingRuleId" in row) expect(option.mappingRuleId).toBe(row.mappingRuleId as string);
          if ("strength" in row) expect(option.strength).toBe(row.strength as string);
          if ("containedChordDegrees" in row) expect(option.containment.containedChordDegrees.map(token)).toEqual(row.containedChordDegrees);
          if ("availableTensions" in row) {
            expect(option.tensions.filter((tension) => tension.availability === "available").map((tension) => token(tension.degree)))
              .toEqual(row.availableTensions);
          }
          if ("clashes" in row) {
            expect(option.minorNinthClashes.map((clash) => ({ tension: token(clash.tensionDegree), chordTone: token(clash.chordToneDegree) })))
              .toEqual(row.clashes);
          }
          if ("exceptions" in row) expect(option.exceptions.map((exception) => exception.id)).toEqual(row.exceptions);
          if (expected.selectedRealizationPreserved === true) expect(option.selectedRealizationId).toBe(request.current.selectedRealizationId ?? "");
        });
      }
      if ("disposition" in expected && result.ok) expect(result.value.disposition).toBe(expected.disposition as string);
      if (expected.uniqueScaleClaim === false) expect(found.length).toBeGreaterThan(1);
      for (const family of (expected.forbiddenFamilies ?? []) as string[]) {
        expect(found.map((option) => option.family)).not.toContain(family);
      }
      for (const family of (expected.forbiddenExactFamilies ?? []) as string[]) {
        expect(found.filter((option) => option.strength === "exact").map((option) => option.family)).not.toContain(family);
      }
      for (const ruleId of (expected.forbiddenMappingRuleIds ?? []) as string[]) {
        expect(found.map((option) => option.mappingRuleId)).not.toContain(ruleId);
      }
      if ("clashes" in expected) {
        const all = found.flatMap((option) => option.minorNinthClashes.map((clash) => ({
          tension: token(clash.tensionDegree), chordTone: token(clash.chordToneDegree), exception: clash.exceptionApplied,
        })));
        for (const clash of expected.clashes as { tension: string; chordTone: string }[]) {
          const match = all.find((row) => row.tension === clash.tension && row.chordTone === clash.chordTone);
          expect(match === undefined ? "absent" : "present").toBe("present");
          if (expected.suspendedExceptionApplied === false) expect(match?.exception).toBe(false);
        }
      }
      if ("matches" in expected) {
        // Compound tensions are contained by same-alteration simple degrees only.
        const mixolydian = found.find((option) => option.mappingRuleId === "h0.scale.mixolydian");
        const scale = mixolydian?.degrees.map(token) ?? [];
        for (const match of expected.matches as { chordDegree: string; scaleDegree: string }[]) {
          expect(mixolydian?.containment.containedChordDegrees.map(token)).toContain(match.chordDegree);
          expect(scale).toContain(match.scaleDegree);
          expect(scale).not.toContain(match.chordDegree);
        }
      }
      if ("clashRecordRetained" in expected) {
        const retained = expected.clashRecordRetained as { tension: string; chordTone: string };
        const option = found.find((row) => row.exceptions.some((exception) => exception.id === expected.exceptionRetained));
        expect(option?.minorNinthClashes.map((clash) => [token(clash.tensionDegree), token(clash.chordToneDegree), clash.exceptionApplied]))
          .toContainEqual([retained.tension, retained.chordTone, true]);
        expect(option?.tensions.filter((tension) => tension.availability === "available").map((tension) => token(tension.degree)))
          .toContain(expected.availableTensionRetained as string);
      }
    });
  }
});

describe("declaration validation", () => {
  for (const row of scaleCases.declarationCases) {
    test(row.id, () => {
      const spec: ChordSpec = row.currentRoot === null
        ? { kind: "custom", sourceText: "cluster", label: "cluster", pitchNames: [{ step: "C", alter: 0 }, { step: "D", alter: -1 }], bass: null } as unknown as ChordSpec
        : chordSpec(`${row.currentRoot.step}${row.currentRoot.alter < 0 ? "b".repeat(-row.currentRoot.alter) : "#".repeat(row.currentRoot.alter)}7b9`);
      const request = build(spec, { key: null, declaredSpan: "unspecified" }, row.currentRoot === null ? "custom" : "literal", row.declaration);
      const result = enumerateChordScaleOptions(request);
      if (row.expectedDefect === null) {
        expect(result.ok ? "ok" : result.refusal.code).toBe("ok");
        if (result.ok) expect(result.value.declaredScaleContextUsed).toEqual(row.declaration as never);
      } else {
        expect(result.ok ? "ok" : result.refusal.code).toBe("harmony.scale_context_invalid");
        if (!result.ok && result.refusal.code === "harmony.scale_context_invalid") expect(result.refusal.defect).toBe(row.expectedDefect as never);
      }
    });
  }
});

describe("all-root expansion", () => {
  const rootSpelling = (rootId: string): SpelledPitchClass => {
    const root = sources.rootInventory.find((row) => row.id === rootId);
    if (root === undefined) throw new Error(rootId);
    return root.spelling as SpelledPitchClass;
  };
  const C: SpelledPitchClass = { step: "C", alter: 0 };
  test("every root-by-mapping cell matches its independent spelling and predicate", () => {
    let checked = 0;
    for (const cell of scaleCases.rootExpansion.cells) {
      const seed = scaleCases.cases.find((row) => row.id === cell.seedCaseId);
      if (seed === undefined) throw new Error(cell.seedCaseId);
      const base = requestForCase(seed);
      const target = rootSpelling(cell.rootId);
      let request = base;
      if (target.step !== "C" || target.alter !== 0) {
        const interval = intervalBetweenTonics(C, target, "up");
        if (interval === null) throw new Error(`no interval to ${cell.rootId}`);
        const moved = transposeChordSpecByInterval(chordSpec(sourceSymbol(seed.sourceId).symbol), interval);
        if (!moved.ok) throw new Error(`transpose ${cell.id}`);
        const frame = frameFor("contextId" in seed ? seed.contextId : undefined);
        const key = frame.key === null ? null : { ...frame.key, tonic: target };
        const declaration = base.declaredScaleContext === null ? null : { kind: base.declaredScaleContext.kind, tonic: target };
        request = build(moved.chord, { ...frame, key }, base.current.selectedRealizationId, declaration);
      }
      const result = enumerateChordScaleOptions(request);
      const found = result.ok ? result.value.options : [];
      const option = found.find((row) => row.mappingRuleId === cell.mappingRuleId);
      if (cell.expected.predicateMatches) {
        expect({ cell: cell.id, spellings: option?.spelledPitchNames }).toEqual({ cell: cell.id, spellings: cell.expected.scaleDegreeSpellings as never });
        expect(option?.degrees.map(token)).toEqual(cell.expected.scaleDegrees);
      } else {
        expect({ cell: cell.id, exact: option?.strength === "exact" }).toEqual({ cell: cell.id, exact: false });
      }
      checked += 1;
    }
    expect(checked).toBe(312);
  }, 120_000);
});

describe("plural options, dispositions and refusals", () => {
  test("no key: Cmaj7 stays plural and plausible, never a unique scale claim", () => {
    const result = enumerateChordScaleOptions(build(chordSpec("Cmaj7"), { key: null, declaredSpan: "unspecified" }, "literal", null));
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.value.disposition).toBe("ambiguous");
    expect(result.value.limitations.map((limitation) => limitation.code)).toContain("key-absent");
  });

  test("a minor seventh in a key that contradicts Dorian is honestly unclassified", () => {
    const result = enumerateChordScaleOptions(build(chordSpec("Cm7"),
      { key: { tonic: { step: "C", alter: 0 }, mode: "natural-minor" }, declaredSpan: "tonal" }, "literal", null));
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.value.disposition).toBe("unclassified");
    expect(result.value.options).toEqual([]);
  });

  test("Dm7 in C major is Dorian, plausible until a Dorian frame is declared", () => {
    const keyed = enumerateChordScaleOptions(build(chordSpec("Dm7"),
      { key: { tonic: { step: "C", alter: 0 }, mode: "major" }, declaredSpan: "tonal" }, "literal", null));
    expect(options(keyed).map((option) => [option.family, option.strength])).toEqual([["dorian", "plausible"]]);
    const declared = enumerateChordScaleOptions(build(chordSpec("Dm7"), { key: null, declaredSpan: "modal" }, "literal",
      { kind: "dorian", tonic: { step: "D", alter: 0 } }));
    expect(options(declared).map((option) => [option.family, option.strength])).toEqual([["dorian", "exact"]]);
  });

  test("Custom chords are not-applicable: no root, no family, literal limitations kept", () => {
    const custom = { kind: "custom", sourceText: "cluster", label: "cluster",
      pitchNames: [{ step: "C", alter: 0 }, { step: "D", alter: -1 }], bass: null } as unknown as ChordSpec;
    const result = enumerateChordScaleOptions(build(custom, { key: null, declaredSpan: "unspecified" }, "custom", null));
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.value.disposition).toBe("not-applicable");
    expect(result.value.options).toEqual([]);
    expect(result.value.limitations.map((limitation) => limitation.code)).toEqual(["custom.no_degree_analysis", "custom.no_auto_voicing"]);
  });

  test("refusals follow the frozen precedence and carry no semantic value", () => {
    const valid = build(chordSpec("C7"), { key: null, declaredSpan: "unspecified" }, "literal", null);
    const code = (request: H0ChordScaleRequest) => {
      const result = enumerateChordScaleOptions(request);
      return result.ok ? "ok" : `${result.refusal.code}/${result.evidence.termination}`;
    };
    expect(code({ ...valid, requestId: "" })).toBe("harmony.request_id_invalid/input-refusal");
    expect(code({ ...valid, requestId: "", baseRevision: -1 })).toBe("harmony.request_id_invalid/input-refusal");
    expect(code({ ...valid, baseRevision: 0.5 })).toBe("harmony.base_revision_invalid/input-refusal");
    expect(code({ ...valid, analysisRuleTable: { id: "other", version: 1 } })).toBe("harmony.rule_version_unsupported/input-refusal");
    expect(code({ ...valid, chordScaleMappingTable: { id: H0_CHORD_SCALE_MAPPING_TABLE_ID, version: 2 } })).toBe("harmony.rule_version_unsupported/input-refusal");
    expect(code({ ...valid, next: { ...valid.current } })).toBe("harmony.duplicate_event_id/input-refusal");
    // Rule version outranks a bad declaration regardless of field order.
    expect(code({ ...valid, analysisRuleTable: { id: "other", version: 1 }, declaredScaleContext: { kind: "dorian", tonic: { step: "D", alter: 0 } } }))
      .toBe("harmony.rule_version_unsupported/input-refusal");
  });

  test("outputs are deeply frozen", () => {
    const result = enumerateChordScaleOptions(build(chordSpec("C7b9"), { key: null, declaredSpan: "unspecified" }, "literal",
      { kind: "diminished-dominant", tonic: { step: "C", alter: 0 } }));
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      expect(Object.isFrozen(node)).toBe(true);
      for (const child of Object.values(node)) walk(child);
    };
    walk(result);
  });
});
