import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { c0EvidenceDigest } from "../../scripts/verify-c0-evidence";
import { LEGACY_REPORT_CODE_ORDER } from "../../src/compatibility";
import {
  c0CaseSemanticProjection,
  executeC0ProductionCase,
  type C0CaseExecution,
  type C0ProductionCaseId,
} from "../../src/test-support/c0-verification-harness";
import adversarialFixture from
  "../fixtures/legacy-migration/adversarial-cases.json";
import legacyPresetFixture from
  "../fixtures/legacy-migration/legacy-presets-source.json";
import mutationFixture from
  "../fixtures/legacy-migration/mutation-controls.json";
import presetExpectationFixture from
  "../fixtures/legacy-migration/preset-expectations.json";
import provenanceFixture from
  "../fixtures/legacy-migration/provenance-ledger.json";
import traceFixture from "../fixtures/legacy-migration/trace-ledger.json";

setDefaultTimeout(600_000);

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new Error(`C0_MUTATION_RECORD:${label}`);
  }
  return value;
}

function records(value: unknown, label: string): readonly JsonRecord[] {
  if (!Array.isArray(value)) throw new Error(`C0_MUTATION_ARRAY:${label}`);
  return value.map((item, index) =>
    record(item, `${label}[${String(index)}]`)
  );
}

function unknownArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`C0_MUTATION_ARRAY:${label}`);
  return value as unknown[];
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`C0_MUTATION_TEXT:${label}`);
  return value;
}

function cloneRecord(value: JsonRecord): JsonRecord {
  return structuredClone(value);
}

function runtimeTarget(execution: C0CaseExecution): JsonRecord {
  const projection = c0CaseSemanticProjection(execution);
  const reportCodes = projection.result.reportItems.map(({ code }) => code);
  const reportGroups = projection.result.reportItems.map(({ group }) => group);
  const reportItems = projection.result.reportItems;
  if (!execution.result.ok) {
    return {
      channel: "runtime",
      caseId: execution.caseId,
      ok: false,
      refusalCode: execution.result.refusal.code,
      refusalPath: execution.result.refusal.path,
      reportCodes,
      reportGroups,
      reportItems,
      parseCalls: projection.parseCalls,
      termination: projection.termination,
      counters: projection.counters,
      retried: false,
      partialCandidate: false,
      validatedBrand: false,
      publicationCalls: 0,
      diagnosticTextLeaks: projection.privateTextLeaks,
      prototypePolluted: projection.prototypePolluted,
      inertStringExecuted: projection.inertStringExecuted,
    };
  }
  const report = execution.result.value.report;
  return {
    channel: "runtime",
    caseId: execution.caseId,
    ok: true,
    refusalCode: null,
    refusalPath: null,
    reportCodes,
    reportGroups,
    reportItems,
    parseCalls: projection.parseCalls,
    termination: projection.termination,
    counters: projection.counters,
    parsedEvents: report.summary.parsedEvents,
    customEvents: report.summary.customEvents,
    rejectedEvents: report.summary.rejectedEvents,
    manualEvents: report.summary.manualEvents,
    autoEvents: report.summary.autoEvents,
    retried: false,
    partialCandidate: false,
    validatedBrand: false,
    publicationCalls: 0,
    diagnosticTextLeaks: projection.privateTextLeaks,
    prototypePolluted: projection.prototypePolluted,
    inertStringExecuted: projection.inertStringExecuted,
  };
}

function adversarialRows(): readonly JsonRecord[] {
  return records(record(adversarialFixture, "adversarial")["cases"], "cases");
}

function presetExpectationRows(): readonly JsonRecord[] {
  const root = record(presetExpectationFixture, "preset expectations");
  return [
    "directNameParsedManual",
    "rootTypeFallbackParsedManual",
    "directNameSpellingConflict",
    "directNameSoundingConflict",
    "rootTypeFallbackConflict",
    "noParseableSymbol",
  ].flatMap((category) =>
    records(root[category], category).map((row) => ({ category, ...row }))
  );
}

function presetSourceRows(): readonly JsonRecord[] {
  const root = record(legacyPresetFixture, "legacy presets");
  const result: JsonRecord[] = [];
  for (const preset of records(root["presets"], "presets")) {
    const presetId = text(preset["legacyPresetId"], "legacyPresetId");
    for (const [sectionIndex, section] of records(
      preset["sections"],
      `${presetId}.sections`,
    ).entries()) {
      for (const [chordIndex, chord] of records(
        section["chords"],
        `${presetId}.sections[${String(sectionIndex)}].chords`,
      ).entries()) {
        result.push({
          id: `${presetId}:${String(sectionIndex)}:${String(chordIndex)}`,
          ...chord,
        });
      }
    }
  }
  return result;
}

function rowById(
  rows: readonly JsonRecord[],
  id: string,
  label: string,
): JsonRecord {
  const row = rows.find((candidate) => candidate["id"] === id);
  if (row === undefined) throw new Error(`C0_MUTATION_ROW:${label}:${id}`);
  return row;
}

function fixtureTarget(linkedCaseId: string): JsonRecord {
  if (linkedCaseId.includes(":")) {
    return {
      channel: "preset",
      source: rowById(presetSourceRows(), linkedCaseId, "preset source"),
      expectation: rowById(
        presetExpectationRows(),
        linkedCaseId,
        "preset expectation",
      ),
      present: true,
    };
  }
  if (linkedCaseId.startsWith("C0-AUTH-")) {
    return {
      channel: "authority",
      row: rowById(
        records(record(provenanceFixture, "provenance")["authorities"], "authorities"),
        linkedCaseId,
        "authority",
      ),
      present: true,
    };
  }
  if (linkedCaseId.startsWith("C0-TRACE-")) {
    return {
      channel: "trace",
      row: rowById(
        records(record(traceFixture, "trace")["traces"], "traces"),
        linkedCaseId,
        "trace",
      ),
      present: true,
    };
  }
  throw new Error(`C0_MUTATION_LINK_UNKNOWN:${linkedCaseId}`);
}

function removeCode(target: JsonRecord, code: string): void {
  const codes = target["reportCodes"];
  if (!Array.isArray(codes)) throw new Error("C0_MUTATION_REPORT_CODES");
  target["reportCodes"] = codes.filter((item) => item !== code);
}

function mutateRuntime(controlId: string, target: JsonRecord): void {
  switch (controlId) {
    case "C0-MUT-001":
      target["parsedEvents"] = 0;
      target["customEvents"] = 1;
      break;
    case "C0-MUT-002":
      target["parsedEvents"] = 1;
      target["customEvents"] = 0;
      removeCode(target, "legacy.custom.name_notes_spelling_conflict");
      break;
    case "C0-MUT-003":
      target["parsedEvents"] = 1;
      target["rejectedEvents"] = 0;
      removeCode(target, "legacy.rejected.no_usable_symbol_or_notes");
      break;
    case "C0-MUT-004":
      target["parseCalls"] = ["Cmaj7(b5)"];
      break;
    case "C0-MUT-005":
      target["parsedEvents"] = 1;
      removeCode(target, "legacy.ignored.unknown_type");
      break;
    case "C0-MUT-006":
      target["parsedEvents"] = 1;
      target["customEvents"] = 0;
      break;
    case "C0-MUT-007":
    case "C0-MUT-008":
    case "C0-MUT-009":
      target["manualEvents"] = 1;
      target["autoEvents"] = 0;
      removeCode(target, "legacy.ignored.invalid_notes");
      break;
    case "C0-MUT-010":
    case "C0-MUT-011":
    case "C0-MUT-012":
      target["ok"] = true;
      target["refusalCode"] = null;
      target["refusalPath"] = null;
      break;
    case "C0-MUT-013":
      target["refusalCode"] = "legacy.json_syntax_invalid";
      break;
    case "C0-MUT-014":
      target["prototypePolluted"] = true;
      target["inertStringExecuted"] = true;
      break;
    case "C0-MUT-015":
      target["retried"] = true;
      target["partialCandidate"] = true;
      break;
    case "C0-MUT-016": {
      const reordered = unknownArray(target["reportItems"], "report items")
        .map((item, index) => record(item, `report items[${String(index)}]`));
      const swapIndex = reordered.findIndex((item, index) =>
        index + 1 < reordered.length &&
        item["group"] === reordered[index + 1]?.["group"]
      );
      const left = reordered[swapIndex];
      const right = reordered[swapIndex + 1];
      if (swapIndex < 0 || left === undefined || right === undefined) {
        throw new Error("C0_MUTATION_REPORT_WITHIN_GROUP_PAIR");
      }
      reordered[swapIndex] = right;
      reordered[swapIndex + 1] = left;
      target["reportItems"] = reordered;
      target["reportCodes"] = reordered.map((item) => item["code"]);
      target["reportGroups"] = reordered.map((item) => item["group"]);
      break;
    }
    case "C0-MUT-017":
      target["diagnosticTextLeaks"] = 1;
      break;
    case "C0-MUT-018":
      target["validatedBrand"] = true;
      target["publicationCalls"] = 1;
      break;
    default:
      throw new Error(`C0_MUTATION_RUNTIME_UNKNOWN:${controlId}`);
  }
}

function mutateFixture(controlId: string, target: JsonRecord): void {
  const source = record(target["source"] ?? {}, "target source");
  const expectation = record(target["expectation"] ?? {}, "target expectation");
  switch (controlId) {
    case "C0-MUT-019":
      expectation["category"] = "directNameSoundingConflict";
      break;
    case "C0-MUT-020":
      expectation["category"] = "noParseableSymbol";
      expectation["constructedText"] = null;
      break;
    case "C0-MUT-021":
    case "C0-MUT-022":
    case "C0-MUT-023":
      expectation["category"] = "directNameParsedManual";
      break;
    case "C0-MUT-024":
      expectation["category"] = "rootTypeFallbackParsedManual";
      expectation["constructedText"] = "C7sus4";
      break;
    case "C0-MUT-025": {
      const notes = unknownArray(source["notes"], "preset notes");
      if (notes.length === 0) {
        throw new Error("C0_MUTATION_PRESET_NOTES");
      }
      source["notes"] = ["C0", ...notes.slice(1)];
      break;
    }
    case "C0-MUT-026":
      source["name"] = "C";
      break;
    case "C0-MUT-027":
      target["present"] = false;
      break;
    case "C0-MUT-028":
    case "C0-MUT-029":
      target["present"] = false;
      break;
    case "C0-MUT-030": {
      const row = record(target["row"], "trace row");
      row["fixtureIds"] = [];
      break;
    }
    default:
      throw new Error(`C0_MUTATION_FIXTURE_UNKNOWN:${controlId}`);
  }
}

function mutateTarget(controlId: string, baseline: JsonRecord): JsonRecord {
  const target = cloneRecord(baseline);
  if (controlId <= "C0-MUT-018") mutateRuntime(controlId, target);
  else mutateFixture(controlId, target);
  return target;
}

type PathSegment = string | number;

const reportCodeRank: ReadonlyMap<string, number> = new Map(
  LEGACY_REPORT_CODE_ORDER.map((code, index) => [code, index] as const),
);

function reportPath(value: unknown, label: string): readonly PathSegment[] {
  const path = unknownArray(value, label);
  if (!path.every((segment) =>
    typeof segment === "string" ||
    (typeof segment === "number" && Number.isSafeInteger(segment))
  )) {
    throw new Error(`C0_MUTATION_PATH:${label}`);
  }
  return path as readonly PathSegment[];
}

function compareUnicodeScalars(left: string, right: string): number {
  const leftScalars = Array.from(left, (scalar) => scalar.codePointAt(0) ?? 0);
  const rightScalars = Array.from(right, (scalar) => scalar.codePointAt(0) ?? 0);
  const shared = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < shared; index += 1) {
    const leftScalar = leftScalars[index];
    const rightScalar = rightScalars[index];
    if (leftScalar === undefined || rightScalar === undefined) continue;
    if (leftScalar !== rightScalar) return leftScalar < rightScalar ? -1 : 1;
  }
  return leftScalars.length - rightScalars.length;
}

function compareReportPaths(
  left: readonly PathSegment[],
  right: readonly PathSegment[],
): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (leftSegment === undefined || rightSegment === undefined) continue;
    if (leftSegment === rightSegment) continue;
    if (typeof leftSegment === "string") {
      return typeof rightSegment === "number"
        ? -1
        : compareUnicodeScalars(leftSegment, rightSegment);
    }
    if (typeof rightSegment === "string") return 1;
    return leftSegment < rightSegment ? -1 : 1;
  }
  return left.length - right.length;
}

function compareProjectedReportItems(left: JsonRecord, right: JsonRecord): number {
  const groups: Readonly<Record<string, number>> = {
    preserved: 0,
    canonicalized: 1,
    custom: 2,
    ignored: 3,
    rejected: 4,
  };
  const leftGroup = typeof left["group"] === "string"
    ? groups[left["group"]] ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER;
  const rightGroup = typeof right["group"] === "string"
    ? groups[right["group"]] ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER;
  if (leftGroup !== rightGroup) return leftGroup - rightGroup;
  const source = compareReportPaths(
    reportPath(left["sourcePath"], "left source path"),
    reportPath(right["sourcePath"], "right source path"),
  );
  if (source !== 0) return source;
  const leftCode = typeof left["code"] === "string"
    ? reportCodeRank.get(left["code"]) ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER;
  const rightCode = typeof right["code"] === "string"
    ? reportCodeRank.get(right["code"]) ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER;
  if (leftCode !== rightCode) return leftCode - rightCode;
  if (left["targetPath"] === null) return right["targetPath"] === null ? 0 : -1;
  if (right["targetPath"] === null) return 1;
  return compareReportPaths(
    reportPath(left["targetPath"], "left target path"),
    reportPath(right["targetPath"], "right target path"),
  );
}

function oracleFailures(controlId: string, target: JsonRecord): readonly string[] {
  const failures: string[] = [];
  const require = (condition: boolean, label: string): void => {
    if (!condition) failures.push(label);
  };
  const hasCode = (code: string): boolean =>
    Array.isArray(target["reportCodes"]) && target["reportCodes"].includes(code);
  const exactTextArray = (key: string, expected: readonly string[]): boolean =>
    Array.isArray(target[key]) &&
    target[key].length === expected.length &&
    target[key].every((item, index) => item === expected[index]);
  const nested = (key: string): JsonRecord => record(target[key] ?? {}, key);

  switch (controlId) {
    case "C0-MUT-001":
      require(target["parsedEvents"] === 1, "parsed event");
      require(target["customEvents"] === 0, "no custom downgrade");
      require(target["manualEvents"] === 1, "manual voicing");
      break;
    case "C0-MUT-002":
      require(target["parsedEvents"] === 0, "spelling conflict is not parsed");
      require(target["customEvents"] === 1, "spelling conflict is custom");
      require(
        hasCode("legacy.custom.name_notes_spelling_conflict"),
        "spelling-conflict diagnostic",
      );
      break;
    case "C0-MUT-003":
      require(target["parsedEvents"] === 0, "no invented parsed event");
      require(target["rejectedEvents"] === 1, "rejected unusable event");
      require(
        hasCode("legacy.rejected.no_usable_symbol_or_notes"),
        "unusable-event diagnostic",
      );
      break;
    case "C0-MUT-004":
      require(exactTextArray("parseCalls", ["Cmaj7"]), "flags do not rewrite name");
      break;
    case "C0-MUT-005":
      require(target["parsedEvents"] === 0, "unknown exact type is not parsed");
      require(target["customEvents"] === 1, "trusted notes remain custom");
      require(hasCode("legacy.ignored.unknown_type"), "unknown-type diagnostic");
      break;
    case "C0-MUT-006":
      require(target["parsedEvents"] === 0, "realizations are not unioned");
      require(target["customEvents"] === 1, "altered conflict is custom");
      break;
    case "C0-MUT-007":
    case "C0-MUT-008":
    case "C0-MUT-009":
      require(target["manualEvents"] === 0, "untrusted notes are not manual");
      require(target["autoEvents"] === 1, "parsed symbol retains auto voicing");
      require(hasCode("legacy.ignored.invalid_notes"), "invalid-notes diagnostic");
      break;
    case "C0-MUT-010":
      require(target["ok"] === false, "byte excess refuses");
      require(
        target["refusalCode"] === "limit.legacy_utf8_bytes_exceeded",
        "byte-limit refusal code",
      );
      break;
    case "C0-MUT-011":
      require(target["ok"] === false, "depth excess refuses");
      require(
        target["refusalCode"] === "limit.legacy_json_depth_exceeded",
        "depth-limit refusal code",
      );
      break;
    case "C0-MUT-012":
      require(target["ok"] === false, "report excess refuses");
      require(
        target["refusalCode"] === "limit.legacy_report_items_exceeded",
        "report-limit refusal code",
      );
      break;
    case "C0-MUT-013":
      require(target["ok"] === false, "malformed UTF-8 refuses");
      require(target["refusalCode"] === "legacy.utf8_invalid", "UTF-8 refusal code");
      break;
    case "C0-MUT-014":
      require(target["prototypePolluted"] === false, "prototype remains inert");
      require(target["inertStringExecuted"] === false, "hostile strings remain data");
      break;
    case "C0-MUT-015":
      require(target["ok"] === false, "ID collision refuses");
      require(target["refusalCode"] === "legacy.id_collision", "collision refusal code");
      require(target["retried"] === false, "collision is not retried");
      require(target["partialCandidate"] === false, "no partial candidate");
      break;
    case "C0-MUT-016": {
      const items = unknownArray(target["reportItems"], "oracle report items")
        .map((item, index) => record(item, `oracle report items[${String(index)}]`));
      require(items.length > 1, "ordered report items exist");
      require(
        items.every((item, index) =>
          index === 0 || compareProjectedReportItems(items[index - 1] ?? {}, item) <= 0
        ),
        "source-path, code-order, and target-path report order",
      );
      break;
    }
    case "C0-MUT-017":
      require(target["diagnosticTextLeaks"] === 0, "private text is not echoed");
      break;
    case "C0-MUT-018":
      require(target["validatedBrand"] === false, "candidate remains unbranded");
      require(target["publicationCalls"] === 0, "C0 never publishes");
      break;
    case "C0-MUT-019":
      require(nested("expectation")["category"] === "directNameParsedManual", "reviewed parsed preset");
      break;
    case "C0-MUT-020":
      require(nested("expectation")["category"] === "rootTypeFallbackParsedManual", "reviewed fallback preset");
      require(nested("expectation")["constructedText"] === "F#m9/C#", "reviewed constructed symbol");
      break;
    case "C0-MUT-021":
      require(nested("expectation")["category"] === "directNameSpellingConflict", "reviewed spelling conflict");
      break;
    case "C0-MUT-022":
      require(nested("expectation")["category"] === "directNameSoundingConflict", "reviewed sounding conflict");
      break;
    case "C0-MUT-023":
      require(nested("expectation")["category"] === "rootTypeFallbackConflict", "reviewed fallback conflict");
      break;
    case "C0-MUT-024":
      require(nested("expectation")["category"] === "noParseableSymbol", "7sus4 remains unknown");
      break;
    case "C0-MUT-025": {
      const notes = nested("source")["notes"];
      require(Array.isArray(notes) && notes[0] === "C3", "audited note spelling");
      break;
    }
    case "C0-MUT-026":
      require(nested("source")["name"] === "F#m9(maj7)/C#", "audited chord name");
      break;
    case "C0-MUT-027":
    case "C0-MUT-028":
    case "C0-MUT-029":
      require(target["present"] === true, "reviewed authority row remains present");
      break;
    case "C0-MUT-030": {
      const fixtureIds = nested("row")["fixtureIds"];
      require(
        Array.isArray(fixtureIds) &&
          ["C0-REPORT-007", "C0-APPLY-002", "C0-APPLY-005"].every((id) =>
            fixtureIds.includes(id)
          ),
        "no-publication trace remains linked",
      );
      break;
    }
    default:
      failures.push(`unknown control ${controlId}`);
  }
  return failures;
}

describe("C0 reviewed mutation controls", () => {
  test("kills all 30 reviewed semantic counterfactuals deterministically", () => {
    const controls = records(
      record(mutationFixture, "mutation fixture")["controls"],
      "controls",
    );
    expect(controls).toHaveLength(30);
    const adversarialIds = new Set(
      adversarialRows().map((row) => text(row["id"], "adversarial.id")),
    );
    const runtimeExecutions = new Map<string, C0CaseExecution>();
    const executions: Array<Readonly<{
      controlId: string;
      linkedCaseId: string;
      beforeSha256: string;
      afterSha256: string;
      killed: true;
    }>> = [];
    const controlExecutionDigests: Record<string, string> = {};

    for (const control of controls) {
      const controlId = text(control["id"], "control.id");
      const linkedCaseId = text(control["linkedCaseId"], `${controlId}.link`);
      let baseline: JsonRecord;
      if (linkedCaseId.startsWith("C0-") &&
        !linkedCaseId.startsWith("C0-AUTH-") &&
        !linkedCaseId.startsWith("C0-TRACE-")) {
        expect(adversarialIds.has(linkedCaseId), linkedCaseId).toBe(true);
        const execution = executeC0ProductionCase(
          linkedCaseId as C0ProductionCaseId,
        );
        runtimeExecutions.set(linkedCaseId, execution);
        baseline = runtimeTarget(execution);
      } else {
        baseline = fixtureTarget(linkedCaseId);
      }
      const mutated = mutateTarget(controlId, baseline);
      expect(oracleFailures(controlId, baseline), `${controlId}: baseline oracle`).toEqual([]);
      expect(
        oracleFailures(controlId, mutated).length,
        `${controlId}: counterfactual must be rejected by its semantic oracle`,
      ).toBeGreaterThan(0);
      const beforeSha256 = c0EvidenceDigest(baseline);
      const afterSha256 = c0EvidenceDigest(mutated);
      expect(afterSha256, controlId).not.toBe(beforeSha256);
      const execution = Object.freeze({
        controlId,
        linkedCaseId,
        beforeSha256,
        afterSha256,
        killed: true as const,
      });
      executions.push(execution);
      controlExecutionDigests[controlId] = c0EvidenceDigest({
        controlId,
        fault: control["fault"],
        execution,
      });
    }

    expect(executions).toHaveLength(30);
    expect(runtimeExecutions.size).toBe(18);
    const controlIds = controls.map((control) =>
      text(control["id"], "control.id")
    );
    const linkedCaseIds = [...new Set(controls.map((control) =>
      text(control["linkedCaseId"], "control.linkedCaseId")
    ))].sort();
    const payload = {
      schema: "changes.evidence.c0-mutation-conformance-observation.v1",
      producer: {
        file: "tests/conformance/c0-mutation-controls.test.ts",
        testcase: "kills all 30 reviewed semantic counterfactuals deterministically",
      },
      classification:
        "reviewed-contract-projection mutation; runtime production baselines where applicable",
      controlIds,
      linkedCaseIds,
      semanticOperatorsExecuted: controls.length,
      semanticOperatorsKilled: executions.length,
      semanticOperatorsSurvived: 0,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      controlExecutionDigests,
      counterfactualExecutions: executions,
      status: "pass",
    };
    console.log(`C0_MUTATION_OBSERVATION ${JSON.stringify({
      ...payload,
      semanticDigest: c0EvidenceDigest(payload),
    })}`);
  });
});
