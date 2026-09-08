import { expect, test, setDefaultTimeout } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { auditH0ContractConsistency, auditH0DeclaredScaleContext, auditH0FixtureConsistency } from "../../scripts/audit-h0-contract-consistency";
import contexts from "../fixtures/harmony-analysis/context-reading-cases.json";
import sources from "../fixtures/harmony-analysis/source-catalog.json";
import scales from "../fixtures/harmony-analysis/chord-scale-cases.json";
import t1 from "../fixtures/resolution/formula-rules.json";

setDefaultTimeout(60_000);
type RecordValue = Record<string, unknown>;
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
function record(value: unknown): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected fixture record");
  return value as RecordValue;
}
function row(root: RecordValue, key: string, id: string): RecordValue {
  const entries = root[key];
  if (!Array.isArray(entries)) throw new Error("Missing fixture array");
  for (const entry of entries) {
    const result = record(entry);
    if (result["id"] === id) return result;
  }
  throw new Error(`Missing independent row ${id}`);
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing array");
  return value;
}
const failures = (changedContexts: RecordValue = contexts, changedSources: RecordValue = sources, changedScales: RecordValue = scales) =>
  auditH0FixtureConsistency(changedContexts, changedSources, changedScales, t1).map(finding => finding.code);

test("the independently amended packet is semantically consistent with unchanged T1", () => {
  expect(failures()).toEqual([]);
});

test("same musical input cannot change function because it is labeled a passing near miss", () => {
  const changed: RecordValue = structuredClone(contexts);
  const target = row(changed, "cases", "H0-CONTEXT-023");
  const expected = record(target["expected"]);
  expected["disposition"] = "unclassified";
  expected["orderedReadings"] = [{ classification: "unresolved", romanLabel: "#i-dim7", strength: "plausible" }];
  expect(failures(changed)).toContain("H0_IDENTICAL_INPUT_CONFLICT");
  expect(record(row(contexts, "cases", "H0-CONTEXT-023")["expected"])["forbiddenClassifications"]).toEqual(["passing-diminished"]);
});

test("strength order and actual tied-tier ambiguity are separate obligations", () => {
  const ordering: RecordValue = structuredClone(contexts);
  array(record(row(ordering, "cases", "H0-CONTEXT-007")["expected"])["orderedReadings"]).reverse();
  expect(failures(ordering)).toContain("H0_READING_ORDER_CONFLICT");
  for (const id of ["H0-CONTEXT-007", "H0-CONTEXT-012", "H0-CONTEXT-014"]) {
    const ambiguity: RecordValue = structuredClone(contexts);
    record(row(ambiguity, "cases", id)["expected"])["disposition"] = "ambiguous";
    expect(failures(ambiguity)).toContain("H0_AMBIGUITY_TIER_CONFLICT");
  }
  expect(record(row(contexts, "cases", "H0-CONTEXT-013")["expected"])["disposition"]).toBe("ambiguous");
});

for (const id of ["H0-SRC-C13", "H0-SRC-C13SUS4"]) {
  test(`T1 extension closure rejects dropping natural11 from ${id}`, () => {
    const changed: RecordValue = structuredClone(sources);
    const source = row(changed, "chords", id);
    source["degrees"] = array(source["degrees"]).filter(degree => degree !== "11");
    expect(failures(contexts, changed)).toContain("H0_T1_LITERAL_CONFLICT");
  });
}

test("scale containment retains every named degree including distinct suspension4 and extension11", () => {
  for (const id of ["H0-SCALE-MIX-001", "H0-SCALE-SUS-001"]) {
    const changed: RecordValue = structuredClone(scales);
    const expected = record(row(changed, "cases", id)["expected"]);
    const option = record(array(expected["orderedOptions"])[0]);
    option["containedChordDegrees"] = array(option["containedChordDegrees"]).filter(degree => degree !== "11");
    expect(failures(contexts, sources, changed)).toContain("H0_SCALE_LITERAL_CONTAINMENT");
  }
});

test("an absent, wrong or fixture-ID-only scale premise cannot certify an exact option", () => {
  for (const declaration of [null, { kind: "locrian-flat-nine", tonic: { step: "C", alter: 0 } }]) {
    const changed: RecordValue = structuredClone(scales);
    row(changed, "cases", "H0-SCALE-HW-001")["declaredScaleContext"] = declaration;
    expect(failures(contexts, sources, changed)).toContain("H0_SCALE_CONTEXT_PREMISE");
  }
  const changed: RecordValue = structuredClone(scales);
  const target = row(changed, "cases", "H0-SCALE-HW-001");
  delete target["declaredScaleContext"];
  target["contextEvidenceIds"] = ["H0-SCALE-EVIDENCE-DIMDOM-001"];
  expect(failures(contexts, sources, changed)).toContain("H0_UNREPRESENTABLE_SCALE_EVIDENCE");
  expect(failures(contexts, sources, changed)).toContain("H0_SCALE_CONTEXT_PREMISE");
  const tonalDorian: RecordValue = structuredClone(scales);
  row(tonalDorian, "cases", "H0-SCALE-DOR-001")["contextId"] = "H0-CONTEXT-C-MAJOR";
  expect(failures(contexts, sources, tonalDorian)).toContain("H0_SCALE_CONTEXT_PREMISE");
});

for (const fixture of scales.declarationCases) {
  test(`independent declaration grammar: ${fixture.id}`, () => {
    expect(auditH0DeclaredScaleContext(fixture.declaration, fixture.currentRoot)).toBe(fixture.expectedDefect);
  });
}

test("every declared frame follows exact written roots, including inverse spelling near misses", () => {
  const roots = [{ step: "C", alter: 0 }, { step: "D", alter: -1 }, { step: "D", alter: 0 },
    { step: "E", alter: -1 }, { step: "E", alter: 0 }, { step: "F", alter: 0 },
    { step: "F", alter: 1 }, { step: "G", alter: 0 }, { step: "A", alter: -1 },
    { step: "A", alter: 0 }, { step: "B", alter: -1 }, { step: "B", alter: 0 }];
  for (const kind of ["diminished-dominant", "dorian", "locrian-flat-nine", "locrian-natural-nine"]) {
    for (const tonic of roots) expect(auditH0DeclaredScaleContext({ kind, tonic }, { ...tonic })).toBe(null);
    expect(auditH0DeclaredScaleContext({ kind, tonic: { step: "G", alter: 1 } }, { step: "A", alter: -1 })).toBe("tonic-mismatch");
  }
});

test("the actual TypeScript public request carries the closed, nullable musical declaration", async () => {
  const report = await auditH0ContractConsistency(repositoryRoot);
  expect(report).toEqual({ schema: "changes.audit.h0-contract-consistency.v1", outcome: "pass", findings: [] });
});

test("public-type mutation: an ID field or unknown cannot masquerade as a musical premise", async () => {
  const original = await readFile(new URL("../../src/theory/chord-scales-contract.ts", import.meta.url), "utf8");
  const field = "declaredScaleContext: H0DeclaredScaleContext | null;";
  expect(original.split(field)).toHaveLength(2);
  for (const replacement of ["contextEvidenceIds: readonly string[];", "declaredScaleContext: unknown;"]) {
    const report = await auditH0ContractConsistency(repositoryRoot, { chordScaleSourceOverride: original.replace(field, replacement) });
    expect(report.outcome).toBe("fail");
    expect(report.findings.map(finding => finding.code)).toContain("H0_UNREPRESENTABLE_SCALE_EVIDENCE");
  }
});

test("public-type mutation: tonic property names cannot hide unrestricted spelling values", async () => {
  const original = await readFile(new URL("../../src/theory/chord-scales-contract.ts", import.meta.url), "utf8");
  const field = "tonic: SpelledPitchClass;";
  expect(original.split(field)).toHaveLength(2);
  const report = await auditH0ContractConsistency(repositoryRoot, {
    chordScaleSourceOverride: original.replace(field, "tonic: Readonly<{ step: string; alter: number }>;"),
  });
  expect(report.outcome).toBe("fail");
  expect(report.findings.map(finding => finding.code)).toContain("H0_UNREPRESENTABLE_SCALE_EVIDENCE");
});
