import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { validateDocumentSemantics } from "../../src/application";
import {
  LEGACY_TYPE_SUFFIX_ENTRIES,
  migrateLegacyJson,
  type LegacyMigrationCandidate,
} from "../../src/compatibility";
import {
  parseStableId,
  type ChordEvent,
  type IdFactoryResult,
  type StableIdFactory,
  type StableIdKind,
} from "../../src/domain";
import {
  c0CaseSemanticProjection,
  C0_PRODUCTION_CASE_IDS,
  executeC0ProductionCase,
  type C0CaseExecution,
  type C0ProductionCaseId,
} from "../../src/test-support/c0-verification-harness";
import { parseChordSymbol, resolveChord } from "../../src/theory";
import {
  c0EvidenceDigest,
  stableC0EvidenceJson,
} from "../../scripts/verify-c0-evidence";
import adversarialFixture from
  "../fixtures/legacy-migration/adversarial-cases.json";
import contractFixture from
  "../fixtures/legacy-migration/c0-legacy-migration-contract.json";
import legacyPresetsFixture from
  "../fixtures/legacy-migration/legacy-presets-source.json";

setDefaultTimeout(600_000);

type CaseAssertion = (execution: C0CaseExecution) => void;
type JsonRecord = Record<string, unknown>;
type C0Refusal = Extract<C0CaseExecution["result"], { ok: false }>;

function requireCandidate(
  execution: C0CaseExecution,
): LegacyMigrationCandidate {
  expect(execution.result.ok, execution.caseId).toBe(true);
  if (!execution.result.ok) {
    throw new Error(`${execution.caseId}:EXPECTED_CANDIDATE`);
  }
  return execution.result.value;
}

function requireRefusal(
  execution: C0CaseExecution,
  code: C0Refusal["refusal"]["code"],
): C0Refusal["refusal"] {
  expect(execution.result.ok, execution.caseId).toBe(false);
  if (execution.result.ok) {
    throw new Error(`${execution.caseId}:EXPECTED_REFUSAL:${code}`);
  }
  expect(execution.result.refusal.code, execution.caseId).toBe(code);
  return execution.result.refusal;
}

function firstEvent(execution: C0CaseExecution): ChordEvent {
  const candidate = requireCandidate(execution);
  const event = candidate.document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error(`${execution.caseId}:EVENT_MISSING`);
  return event;
}

function reportCodes(execution: C0CaseExecution): readonly string[] {
  const candidate = requireCandidate(execution);
  return [
    ...candidate.report.groups.preserved,
    ...candidate.report.groups.canonicalized,
    ...candidate.report.groups.custom,
    ...candidate.report.groups.ignored,
    ...candidate.report.groups.rejected,
  ].map(({ code }) => code);
}

function expectCodes(
  execution: C0CaseExecution,
  ...codes: readonly string[]
): void {
  const actual = reportCodes(execution);
  for (const code of codes) expect(actual, execution.caseId).toContain(code);
}

function expectParsed(
  execution: C0CaseExecution,
  voicing: "manual" | "auto",
): void {
  const event = firstEvent(execution);
  expect(event.chord.kind, execution.caseId).toBe("parsed");
  expect(event.voicing.mode, execution.caseId).toBe(voicing);
}

function expectCustomManual(execution: C0CaseExecution): void {
  const event = firstEvent(execution);
  expect(event.chord.kind, execution.caseId).toBe("custom");
  expect(event.voicing.mode, execution.caseId).toBe("manual");
  expect(event.voicing.bassPolicy, execution.caseId).toBe("included");
}

function expectInvalidNotesAuto(execution: C0CaseExecution): void {
  expectParsed(execution, "auto");
  expectCodes(
    execution,
    "legacy.ignored.invalid_notes",
    "legacy.canonicalized.auto_voicing_default",
  );
}

function expectLimitRefusal(
  execution: C0CaseExecution,
  code: C0Refusal["refusal"]["code"],
  maximum: number,
  received: number,
): void {
  const refusal = requireRefusal(execution, code);
  expect(Reflect.get(refusal, "maximum"), execution.caseId).toBe(maximum);
  expect(Reflect.get(refusal, "received"), execution.caseId).toBe(received);
}

const CASE_ASSERTIONS: Readonly<Record<C0ProductionCaseId, CaseAssertion>> = {
  "C0-PRE-001": (execution) => {
    expectParsed(execution, "manual");
    expectCodes(execution, "legacy.preserved.symbol", "legacy.preserved.manual_notes");
  },
  "C0-PRE-002": (execution) => {
    expectParsed(execution, "auto");
    expectCodes(execution, "legacy.canonicalized.auto_voicing_default");
  },
  "C0-PRE-003": (execution) => {
    expectCustomManual(execution);
    expectCodes(execution, "legacy.custom.name_notes_spelling_conflict");
  },
  "C0-PRE-004": (execution) => {
    expectCustomManual(execution);
    expectCodes(execution, "legacy.custom.name_notes_sounding_conflict");
  },
  "C0-PRE-005": (execution) => {
    expectParsed(execution, "manual");
    expect(execution.parseCalls.map(({ sourceText }) => sourceText)).toEqual([
      "NotAChord", "Dm7",
    ]);
    expectCodes(execution, "legacy.canonicalized.symbol_from_root_type");
  },
  "C0-PRE-006": (execution) => {
    expectCustomManual(execution);
    expectCodes(execution, "legacy.custom.constructed_notes_conflict");
  },
  "C0-PRE-007": (execution) => {
    expectCustomManual(execution);
    expectCodes(
      execution,
      "legacy.custom.notes_without_symbol",
      "legacy.ignored.unknown_type",
    );
  },
  "C0-PRE-008": (execution) => {
    const candidate = requireCandidate(execution);
    expect(candidate.report.summary.migratedEvents).toBe(0);
    expect(candidate.report.summary.rejectedEvents).toBe(1);
    expectCodes(execution, "legacy.rejected.no_usable_symbol_or_notes");
  },
  "C0-PRE-009": (execution) => {
    const expectedTypes = LEGACY_TYPE_SUFFIX_ENTRIES.map(
      ({ suffix }) => `C${suffix}`,
    );
    expect(execution.parseCalls.map(({ sourceText }) => sourceText)).toEqual([
      ...expectedTypes,
      "C7(b5,#5,b9,#9,#11,b13)",
    ]);
    const candidate = requireCandidate(execution);
    expect(candidate.report.summary.parsedEvents).toBe(39);
    expect(candidate.report.summary.rejectedEvents).toBe(1);
  },
  "C0-PRE-010": (execution) => {
    expectParsed(execution, "auto");
    expect(execution.parseCalls.map(({ sourceText }) => sourceText)).toEqual(["Cmaj7"]);
    expectCodes(execution, "legacy.ignored.alteration_evidence");
  },
  "C0-PRE-011": (execution) => {
    expectParsed(execution, "auto");
    expect(execution.parseCalls.map(({ sourceText }) => sourceText)).toEqual([
      "NotAChord", "Dm",
    ]);
    expectCodes(execution, "legacy.ignored.alteration_evidence");
  },
  "C0-PRE-012": (execution) => {
    expectCustomManual(execution);
    expect(execution.parseCalls).toEqual([]);
    expectCodes(execution, "legacy.ignored.unknown_type");
  },
  "C0-PRE-013": (execution) => {
    expectParsed(execution, "manual");
    const event = firstEvent(execution);
    expect(event.chord.bass).toEqual({ step: "E", alter: 0 });
  },
  "C0-PRE-014": (execution) => {
    expectCustomManual(execution);
    expectCodes(execution, "legacy.custom.name_notes_sounding_conflict");
  },
  "C0-PRE-015": (execution) => {
    expectCustomManual(execution);
    expectCodes(execution, "legacy.custom.name_notes_sounding_conflict");
    expect(execution.resolutionCalls).toBe(1);
  },
  "C0-PRE-016": (execution) => {
    expectCustomManual(execution);
    const event = firstEvent(execution);
    expect(event.chord).toMatchObject({
      kind: "custom",
      sourceText: "Private custom label",
      label: "Private custom label",
      bass: null,
    });
    expect(event.voicing).toMatchObject({
      mode: "manual",
      pitches: [
        { step: "C", alter: 0, octave: 3 },
        { step: "G", alter: 0, octave: 3 },
        { step: "C", alter: 0, octave: 4 },
      ],
    });
  },

  "C0-NOTE-001": (execution) => {
    expectParsed(execution, "manual");
    expect(firstEvent(execution).voicing).toMatchObject({
      pitches: [{ step: "C", alter: 0, octave: 4 }],
    });
  },
  "C0-NOTE-002": (execution) => {
    expectInvalidNotesAuto(execution);
    expect(execution.evidence.counters.notesVisited).toBe(2);
  },
  "C0-NOTE-003": (execution) => {
    expectCustomManual(execution);
    expect(firstEvent(execution).voicing).toMatchObject({
      pitches: [
        { step: "C", alter: -1, octave: 4 },
        { step: "B", alter: 1, octave: 3 },
      ],
    });
  },
  "C0-NOTE-004": (execution) => {
    expectInvalidNotesAuto(execution);
  },
  "C0-NOTE-005": (execution) => {
    expectInvalidNotesAuto(execution);
  },
  "C0-NOTE-006": (execution) => {
    expectInvalidNotesAuto(execution);
  },
  "C0-NOTE-007": (execution) => {
    expectInvalidNotesAuto(execution);
    expect(execution.evidence.counters.notesVisited).toBe(0);
  },
  "C0-NOTE-008": (execution) => {
    expectInvalidNotesAuto(execution);
    expect(execution.evidence.counters.notesVisited).toBe(0);
  },
  "C0-NOTE-009": (execution) => {
    expectInvalidNotesAuto(execution);
  },
  "C0-NOTE-010": (execution) => {
    expectInvalidNotesAuto(execution);
    expect(execution.evidence.counters.notesVisited).toBe(2);
  },
  "C0-NOTE-011": (execution) => {
    expectParsed(execution, "manual");
    expect(firstEvent(execution).voicing).toMatchObject({
      pitches: [
        { step: "C", alter: 0, octave: 3 },
        { step: "G", alter: 0, octave: 3 },
        { step: "C", alter: 0, octave: 4 },
      ],
    });
  },
  "C0-NOTE-012": (execution) => {
    expectInvalidNotesAuto(execution);
  },

  "C0-LIMIT-001": (execution) => {
    requireCandidate(execution);
    expect(execution.evidence.counters.bytesVisited).toBe(2_097_152);
  },
  "C0-LIMIT-002": (execution) => {
    expectLimitRefusal(
      execution,
      "limit.legacy_utf8_bytes_exceeded",
      2_097_152,
      2_097_153,
    );
    expect(execution.evidence.counters.bytesVisited).toBe(2_097_153);
  },
  "C0-LIMIT-003": (execution) => {
    requireCandidate(execution);
    expect(execution.evidence.counters.maximumJsonDepth).toBe(32);
  },
  "C0-LIMIT-004": (execution) => {
    expectLimitRefusal(
      execution,
      "limit.legacy_json_depth_exceeded",
      32,
      33,
    );
  },
  "C0-LIMIT-005": (execution) => {
    requireCandidate(execution);
    expect(execution.evidence.counters.sectionsVisited).toBe(64);
  },
  "C0-LIMIT-006": (execution) => {
    const refusal = requireRefusal(execution, "limit.legacy_sections_exceeded");
    expect(refusal.path).toEqual(["sections", 64]);
  },
  "C0-LIMIT-007": (execution) => {
    requireCandidate(execution);
    expect(execution.evidence.counters.chordSlotsVisited).toBe(1_024);
  },
  "C0-LIMIT-008": (execution) => {
    const refusal = requireRefusal(
      execution,
      "limit.legacy_chords_per_section_exceeded",
    );
    expect(refusal.path).toEqual(["sections", 0, "chords", 1_024]);
  },
  "C0-LIMIT-009": (execution) => {
    requireCandidate(execution);
    expect(execution.evidence.counters.chordSlotsVisited).toBe(8_192);
  },
  "C0-LIMIT-010": (execution) => {
    expectLimitRefusal(
      execution,
      "limit.legacy_events_exceeded",
      8_192,
      8_193,
    );
  },
  "C0-LIMIT-011": (execution) => {
    requireRefusal(execution, "limit.legacy_report_items_exceeded");
    expect(execution.evidence.counters.sourcePropertiesVisited).toBe(262_144);
    expect(execution.evidence.counters.reportItemsEmitted).toBe(65_536);
  },
  "C0-LIMIT-012": (execution) => {
    expectLimitRefusal(
      execution,
      "limit.legacy_source_properties_exceeded",
      262_144,
      262_145,
    );
    expect(execution.evidence.counters.reportItemsEmitted).toBe(0);
  },
  "C0-LIMIT-013": (execution) => {
    requireCandidate(execution);
    expect(execution.evidence.counters.reportItemsEmitted).toBe(65_536);
  },
  "C0-LIMIT-014": (execution) => {
    expectLimitRefusal(
      execution,
      "limit.legacy_report_items_exceeded",
      65_536,
      65_537,
    );
    expect(execution.evidence.counters.reportItemsEmitted).toBe(65_536);
  },

  "C0-SHAPE-001": (execution) => {
    const refusal = requireRefusal(execution, "legacy.utf8_invalid");
    expect(refusal.path).toEqual([]);
  },
  "C0-SHAPE-002": (execution) => {
    const refusal = requireRefusal(execution, "legacy.json_syntax_invalid");
    expect(refusal.path).toEqual([]);
  },
  "C0-SHAPE-003": (execution) => {
    const refusal = requireRefusal(execution, "legacy.root_invalid");
    expect(refusal.path).toEqual([]);
  },
  "C0-SHAPE-004": (execution) => {
    const refusal = requireRefusal(execution, "legacy.sections_invalid");
    expect(refusal.path).toEqual(["sections"]);
  },
  "C0-SHAPE-005": (execution) => {
    const candidate = requireCandidate(execution);
    expect(candidate.report.summary.rejectedSections).toBe(1);
    expectCodes(execution, "legacy.rejected.section_not_object");
  },
  "C0-SHAPE-006": (execution) => {
    const candidate = requireCandidate(execution);
    expect(candidate.report.summary.rejectedSections).toBe(2);
    expectCodes(
      execution,
      "legacy.rejected.section_chords_missing",
      "legacy.rejected.section_chords_not_array",
    );
  },
  "C0-SHAPE-007": (execution) => {
    const candidate = requireCandidate(execution);
    expect(candidate.report.summary.rejectedEvents).toBe(1);
    expectCodes(execution, "legacy.rejected.event_not_object");
  },
  "C0-SHAPE-008": (execution) => {
    requireCandidate(execution);
    expect(execution.prototypePolluted).toBe(false);
    expect(execution.inertStringExecuted).toBe(false);
    expect(execution.privateTextLeaks).toBe(0);
    expect(
      reportCodes(execution).filter(
        (code) => code === "legacy.ignored.unknown_field",
      ),
    ).toHaveLength(3);
  },
  "C0-SHAPE-009": (execution) => {
    const candidate = requireCandidate(execution);
    expect(candidate.report.summary.rejectedEvents).toBe(2);
    expectCodes(
      execution,
      "legacy.rejected.invalid_unicode_scalar",
      "legacy.rejected.text_limit",
    );
  },
  "C0-SHAPE-010": (execution) => {
    requireCandidate(execution);
    expect(execution.inputUnchanged).toBe(true);
    expect(execution.resultStableAfterCallerMutation).toBe(true);
    expect(execution.retainedCallerContainers).toBe(0);
  },

  "C0-ID-001": (execution) => {
    requireCandidate(execution);
    expect(execution.requestedKinds).toEqual([
      "document", "section", "measure", "event", "measure", "event",
      "section", "measure", "event", "measure", "event",
    ]);
  },
  "C0-ID-002": (execution) => {
    const refusal = requireRefusal(execution, "legacy.id_factory_failed");
    expect(refusal).toMatchObject({
      path: ["sections", 0, "chords", 0],
      kind: "measure",
      factoryCode: "id.factory_exhausted",
    });
    expect(execution.requestedKinds).toEqual(["document", "section", "measure"]);
  },
  "C0-ID-003": (execution) => {
    const refusal = requireRefusal(execution, "legacy.id_collision");
    expect(refusal).toMatchObject({
      path: ["sections", 0],
      kind: "section",
      firstSourcePath: [],
    });
    expect(execution.requestedKinds).toEqual(["document", "section"]);
  },
  "C0-ID-004": (execution) => {
    const candidate = requireCandidate(execution);
    expect(candidate.report.summary.rejectedEvents).toBe(1);
    expect(execution.requestedKinds).toEqual([
      "document", "section", "measure", "event",
    ]);
  },
  "C0-ID-005": (execution) => {
    requireCandidate(execution);
    expect(execution.publicPrivateEqual).toBe(true);
    expect(execution.publicResult).toEqual(execution.result);
  },
  "C0-ID-006": (execution) => {
    requireCandidate(execution);
    expect(execution.inputUnchanged).toBe(true);
    expect(execution.callerBytesFrozen).toBe(false);
  },

  "C0-REPORT-001": (execution) => {
    const candidate = requireCandidate(execution);
    expect(Object.keys(candidate.report.groups)).toEqual([
      "preserved", "canonicalized", "custom", "ignored", "rejected",
    ]);
    expect(candidate.report.groups.ignored.map(({ sourcePath }) => sourcePath)).toEqual([
      ["a"],
      ["sections", 0, "chords", 0, "aa"],
      ["sections", 0, "chords", 0, "zz"],
      ["sections", 0, "collapsed"],
      ["sections", 0, "isEditingName"],
      ["z"],
    ]);
  },
  "C0-REPORT-002": (execution) => {
    const candidate = requireCandidate(execution);
    expect(
      candidate.report.groups.ignored.filter(
        ({ code }) => code === "legacy.ignored.ui_field",
      ),
    ).toHaveLength(3);
  },
  "C0-REPORT-003": (execution) => {
    const candidate = requireCandidate(execution);
    expect(
      candidate.report.groups.ignored.filter(
        ({ code }) => code === "legacy.ignored.voicing_metadata",
      ),
    ).toHaveLength(4);
    expectCodes(
      execution,
      "legacy.ignored.tensions",
      "legacy.ignored.invalid_bass",
      "legacy.ignored.invalid_field_type",
      "legacy.ignored.invalid_root",
      "legacy.canonicalized.auto_voicing_default",
    );
    expect(firstEvent(execution).voicing.mode).toBe("auto");
  },
  "C0-REPORT-004": (execution) => {
    const candidate = requireCandidate(execution);
    const event = firstEvent(execution);
    expect(candidate.document).toMatchObject({
      meter: { beatsPerBar: 4, beatUnit: 4 },
      tempoBpm: 120,
      key: null,
      playback: {
        instrumentId: "mellow-keys",
        masterVolume: 0.8,
        reverbAmount: 0.2,
        countInBars: 0,
      },
      sections: [{ keyOverride: null, voiceLeadingBoundary: "reset" }],
    });
    expect(event.duration.numerator).toBe(4);
    expect(event.duration.denominator).toBe(1);
    expectCodes(
      execution,
      "legacy.canonicalized.meter_duration_default",
      "legacy.canonicalized.playback_default",
      "legacy.canonicalized.section_policy_default",
    );
  },
  "C0-REPORT-005": (execution) => {
    const candidate = requireCandidate(execution);
    expect(execution.privateTextLeaks).toBe(0);
    expect(candidate.document).toMatchObject({
      title: "PRIVATE_TITLE_SENTINEL",
      description: "PRIVATE_DESCRIPTION_SENTINEL",
      sections: [{
        name: "PRIVATE_SECTION_SENTINEL",
        measures: [{ events: [{ annotation: "PRIVATE_ANNOTATION_SENTINEL" }] }],
      }],
    });
  },
  "C0-REPORT-006": (execution) => {
    const mappings = requireCandidate(execution).report.identityMappings;
    const chordMappings = mappings.filter(
      ({ kind }) => kind === "measure" || kind === "event",
    );
    expect(chordMappings.map(({ kind }) => kind)).toEqual(["measure", "event"]);
    expect(chordMappings[0]?.sourcePath).toEqual(chordMappings[1]?.sourcePath);
  },
  "C0-REPORT-007": (execution) => {
    const candidate = requireCandidate(execution);
    expect(candidate.document.schema).toBe("changes.progression.v2");
    expect(Object.keys(candidate.document)).not.toContain("validatedBrand");
    expect(execution.applicability).toMatchObject({
      status: "deferred",
      owner: "F3/A0",
    });
  },

  "C0-APPLY-001": (execution) => {
    requireCandidate(execution);
    expect(execution.applicability.status).toBe("not-applicable");
    expect(execution.applicability.reason).toContain("synchronous bounded");
  },
  "C0-APPLY-002": (execution) => {
    requireCandidate(execution);
    expect(execution.applicability).toMatchObject({
      status: "not-applicable",
      owner: "A0/E0",
    });
  },
  "C0-APPLY-003": (execution) => {
    requireCandidate(execution);
    expect(execution.applicability.status).toBe("not-applicable");
    expect(execution.applicability.reason).toContain("non-resumable");
  },
  "C0-APPLY-004": (execution) => {
    requireCandidate(execution);
    expect(execution.evidence.termination).toBe("complete-candidate");
    expect(Object.keys(execution.evidence)).not.toContain("elapsedMs");
    expect(execution.applicability.status).toBe("applicable");
  },
  "C0-APPLY-005": (execution) => {
    requireCandidate(execution);
    expect(execution.applicability).toMatchObject({
      status: "deferred",
      owner: "A0/E0/U5",
    });
    expect(execution.applicability.reason).toContain("downstream application transaction");
  },
};

function fixtureCaseIds(): C0ProductionCaseId[] {
  return adversarialFixture.cases.map(({ id }) => id as C0ProductionCaseId);
}

function assertCommonEvidence(execution: C0CaseExecution): void {
  expect(execution.inputUnchanged, execution.caseId).toBe(true);
  expect(execution.publicPrivateEqual, execution.caseId).toBe(true);
  expect(execution.resultStableAfterCallerMutation, execution.caseId).toBe(true);
  expect(execution.retainedCallerContainers, execution.caseId).toBe(0);
  expect(execution.privateTextLeaks, execution.caseId).toBe(0);
  expect(execution.prototypePolluted, execution.caseId).toBe(false);
  expect(execution.inertStringExecuted, execution.caseId).toBe(false);
  expect(execution.publicParseCalls, execution.caseId).toEqual(execution.parseCalls);
  expect(execution.publicResolutionCalls, execution.caseId).toBe(
    execution.resolutionCalls,
  );
  expect(execution.publicRequestedKinds, execution.caseId).toEqual(
    execution.requestedKinds,
  );
  expect(execution.evidence.termination, execution.caseId).toBe(
    execution.result.ok ? "complete-candidate" : "complete-refusal",
  );
  const counters = execution.evidence.counters;
  expect(counters.bytesVisited, execution.caseId).toBeLessThanOrEqual(2_097_153);
  expect(counters.maximumJsonDepth, execution.caseId).toBeLessThanOrEqual(33);
  expect(counters.sourcePropertiesVisited, execution.caseId).toBeLessThanOrEqual(262_145);
  expect(counters.sectionsVisited, execution.caseId).toBeLessThanOrEqual(64);
  expect(counters.chordSlotsVisited, execution.caseId).toBeLessThanOrEqual(8_192);
  expect(counters.notesVisited, execution.caseId).toBeLessThanOrEqual(131_072);
  expect(counters.symbolParseCalls, execution.caseId).toBeLessThanOrEqual(16_384);
  expect(counters.resolutionCalls, execution.caseId).toBeLessThanOrEqual(16_384);
  expect(counters.idRequests, execution.caseId).toBeLessThanOrEqual(16_449);
  expect(counters.reportItemsEmitted, execution.caseId).toBeLessThanOrEqual(65_536);
}

function publicationFactory(prefix: string): StableIdFactory {
  let ordinal = 0;
  return {
    next<K extends StableIdKind>(kind: K): IdFactoryResult<K> {
      ordinal += 1;
      const parsed = parseStableId(
        kind,
        `c0-publication-${prefix}-${kind}-${String(ordinal)}`,
      );
      if (!parsed.ok) {
        return {
          ok: false,
          refusal: { code: "id.factory_exhausted", kind, path: ["id"] },
        };
      }
      return {
        ok: true,
        value: parsed.value,
        source: "deterministic-test",
      };
    },
  };
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`C0_PUBLICATION_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function publishAllPresetCandidates(): number {
  let publicationCalls = 0;
  for (const [index, rawPreset] of legacyPresetsFixture.presets.entries()) {
    const preset = asRecord(rawPreset, `preset-${String(index)}`);
    const legacyPresetId = preset["legacyPresetId"];
    if (typeof legacyPresetId !== "string") {
      throw new Error("C0_PUBLICATION_PRESET_ID");
    }
    const sourceDocument = {
      name: preset["name"],
      description: preset["description"],
      sections: structuredClone(preset["sections"]),
    };
    expect(Object.hasOwn(sourceDocument, "legacyPresetId")).toBe(false);
    const migrated = migrateLegacyJson(
      { sourceBytes: new TextEncoder().encode(JSON.stringify(sourceDocument)) },
      {
        idFactory: publicationFactory(legacyPresetId),
        parseChordSymbol,
        resolveChord,
      },
    );
    expect(migrated.ok, legacyPresetId).toBe(true);
    if (!migrated.ok) {
      throw new Error(`C0_PUBLICATION_MIGRATION:${legacyPresetId}`);
    }
    const candidate = migrated.value.document;
    expect(Object.keys(candidate), legacyPresetId).not.toContain("validatedBrand");
    const published = validateDocumentSemantics(candidate);
    publicationCalls += 1;
    expect(published.ok, legacyPresetId).toBe(true);
    if (!published.ok) {
      throw new Error(`C0_PUBLICATION_F3:${legacyPresetId}`);
    }
    expect(stableC0EvidenceJson(published.value), legacyPresetId).toBe(
      stableC0EvidenceJson(candidate),
    );
    expect(published.warnings, legacyPresetId).toEqual([]);
  }
  return publicationCalls;
}

describe("C0 production conformance observation", () => {
  test("executes all 70 reviewed adversarial cases against production", () => {
    const fixtureIds = fixtureCaseIds();
    expect([...fixtureIds]).toEqual([...C0_PRODUCTION_CASE_IDS]);
    expect(Object.keys(CASE_ASSERTIONS)).toEqual([...C0_PRODUCTION_CASE_IDS]);

    const executions = fixtureIds.map((caseId) => {
      const execution = executeC0ProductionCase(caseId);
      assertCommonEvidence(execution);
      CASE_ASSERTIONS[caseId](execution);
      return execution;
    });
    expect(executions).toHaveLength(70);

    const observedReportCodes = new Set(
      executions.flatMap((execution) =>
        execution.result.ok ? reportCodes(execution) : []
      ),
    );
    const expectedReportCodes = Object.values(contractFixture.report.codes).flat();
    expect([...observedReportCodes].sort()).toEqual(
      [...expectedReportCodes].sort(),
    );

    const externalF3PublicationCalls = publishAllPresetCandidates();
    expect(externalF3PublicationCalls).toBe(3);

    const caseHashes = Object.fromEntries(
      executions.map((execution) => {
        const projection = c0CaseSemanticProjection(execution);
        expect(stableC0EvidenceJson(projection).endsWith("\n")).toBe(true);
        return [execution.caseId, c0EvidenceDigest(projection)];
      }),
    );
    expect(Object.keys(caseHashes)).toEqual(fixtureIds);

    const unsigned = {
      schema: "changes.evidence.c0-production-conformance-observation.v1",
      producer: {
        file: "tests/conformance/c0-production-conformance.test.ts",
        testcase: "executes all 70 reviewed adversarial cases against production",
      },
      caseIds: fixtureIds,
      caseHashes,
      casesObserved: executions.length,
      publicExecutions: executions.length,
      privateExecutions: executions.length,
      deterministicReplays: executions.filter(
        ({ publicPrivateEqual }) => publicPrivateEqual,
      ).length,
      publicationCalls: 0,
      externalF3PublicationCalls,
      externalF3Accepted: externalF3PublicationCalls,
      validatedBrandReturned: false,
      inputMutations: executions.filter(({ inputUnchanged }) => !inputUnchanged).length,
      retainedCallerContainers: executions.reduce(
        (sum, { retainedCallerContainers }) => sum + retainedCallerContainers,
        0,
      ),
      privateTextLeaks: executions.reduce(
        (sum, { privateTextLeaks }) => sum + privateTextLeaks,
        0,
      ),
      status: "pass" as const,
    };
    const signed = {
      ...unsigned,
      semanticDigest: c0EvidenceDigest(unsigned),
    };
    console.log(`C0_PRODUCTION_OBSERVATION ${JSON.stringify(signed)}`);
  });
});
