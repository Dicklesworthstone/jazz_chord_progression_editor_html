import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonObjectProperty =
  | "algorithmId"
  | "alterationFlagEntries"
  | "applicability"
  | "authorities"
  | "authorityIds"
  | "automatedListeningClaim"
  | "beadId"
  | "caseIds"
  | "cases"
  | "channels"
  | "checkpoints"
  | "chords"
  | "codes"
  | "companions"
  | "contractVersion"
  | "controlIds"
  | "controls"
  | "convolverNormalize"
  | "counts"
  | "coverageSummary"
  | "createdNodeCount"
  | "currentDocumentMutation"
  | "dimension"
  | "durationSeconds"
  | "edgeCount"
  | "edges"
  | "evidenceOwner"
  | "existingDestinationCount"
  | "expected"
  | "expectedCounts"
  | "expectedFindingCode"
  | "expectedValuesGenerated"
  | "fault"
  | "file"
  | "firstEightLeftQ15"
  | "firstEightRightQ15"
  | "fixtureIds"
  | "groupOrder"
  | "id"
  | "identities"
  | "independence"
  | "instrumentId"
  | "instrumentRows"
  | "legacyPresetId"
  | "license"
  | "limits"
  | "linkedCaseId"
  | "maximums"
  | "nearMissOf"
  | "nodes"
  | "normalization"
  | "numericPolicy"
  | "operation"
  | "operationOrder"
  | "ordering"
  | "outputLevel"
  | "ownership"
  | "package"
  | "pointer"
  | "policies"
  | "polyphonyLimit"
  | "presets"
  | "productionImplementationAvailableWhenAuthored"
  | "productionImportsForbidden"
  | "productionOutputUsed"
  | "publicSurface"
  | "publication"
  | "pulseWave"
  | "recipeSetId"
  | "recipeSetVersion"
  | "recipes"
  | "referenceBytes"
  | "referenceChannelInt16LeSha256"
  | "referenceCountPerVoice"
  | "referenceFinalStateHex"
  | "referenceFinalStateUint32"
  | "referenceFrames"
  | "referenceInterleavedInt16LeSha256"
  | "referencePeakQ15"
  | "referenceSampleRate"
  | "referenceScalarSamples"
  | "refusal"
  | "refusalCodes"
  | "releaseSeconds"
  | "releaseStatus"
  | "report"
  | "reportCodes"
  | "requirement"
  | "reviewState"
  | "reviewedCompanionDigests"
  | "reviewedCounts"
  | "reviewedFileSha256"
  | "routingCases"
  | "runtimeNetworkRequired"
  | "sampleRateRange"
  | "scenarioRows"
  | "scheduledSourceCount"
  | "schema"
  | "sections"
  | "seedHex"
  | "seedUint32"
  | "settings"
  | "states"
  | "targetFile"
  | "terminations"
  | "traces"
  | "typeSuffixEntries"
  | "validatedBrand"
  | "value"
  | "wallTimeCutoff"
  | "work"
  | "workCounterOrder"
;

type JsonObject = Record<string, unknown> &
  Partial<Record<JsonObjectProperty, unknown>>;

export type C0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type C0ContractValidationReport = Readonly<{
  schema: "changes.validation.c0-contract.v1";
  package: "C0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    adversarialCases: number;
    presetChords: number;
    presetExpectationRows: number;
    mutationControls: number;
    traces: number;
    authorities: number;
    types: number;
    flags: number;
    reportCodes: number;
    refusalCodes: number;
  }>;
  findings: readonly C0ContractFinding[];
}>;

const CONTRACT_FILENAME = "c0-legacy-migration-contract.json";

export const C0_REVIEWED_CONTRACT_BYTE_DIGEST =
  "c63c16ca52fc81a8dc06a9c08b4ff3438b4f1f3172121a5dfbd0e08623269960";

export const C0_REVIEWED_COMPANIONS = [
  "adversarial-cases.json",
  "legacy-presets-source.json",
  "mutation-controls.json",
  "preset-expectations.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const;

type CompanionFilename = (typeof C0_REVIEWED_COMPANIONS)[number];

const EXPECTED_FILES = [CONTRACT_FILENAME, ...C0_REVIEWED_COMPANIONS] as const;

const EXPECTED_SCHEMAS: Readonly<Record<string, string>> = {
  [CONTRACT_FILENAME]: "changes.fixtures.c0-legacy-migration-contract.v1",
  "adversarial-cases.json": "changes.fixtures.c0-adversarial-cases.v1",
  "legacy-presets-source.json":
    "changes.fixtures.c0-legacy-presets-source.v1",
  "mutation-controls.json": "changes.fixtures.c0-mutation-controls.v1",
  "preset-expectations.json":
    "changes.fixtures.c0-preset-expectations.v1",
  "provenance-ledger.json": "changes.fixtures.c0-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.c0-trace-ledger.v1",
};

export const C0_REVIEWED_BYTE_DIGESTS: Readonly<
  Record<CompanionFilename, string>
> = {
  "adversarial-cases.json":
    "413b7303d55febf188c0fcda7049c04f9a82a3106f52c02915783fe601f2fcbb",
  "legacy-presets-source.json":
    "2e65ffd697ed9fb7604c01a021bfc0c079aa0d21cffe20e675780161db32198c",
  "mutation-controls.json":
    "202eb95ddffd1e3eebb0e1fbfaa9a5a9a6d8471a083bc4da79baddf7f49ce574",
  "preset-expectations.json":
    "20789f27f7445e4e03525ebe475f8d22a6487370a852743d5343133d0c8d7734",
  "provenance-ledger.json":
    "4f1cd7a29838928771dea5057f9716beb7476f3ff2c5472d70cbc0ca7124551a",
  "trace-ledger.json":
    "6c39491791aaebdb49720288caf12d4b90e1a86004bcdb692fcb7caf52beb050",
};

export const C0_REVIEWED_TYPE_SUFFIX_ENTRIES = [
  ["major", ""],
  ["minor", "m"],
  ["dim", "dim"],
  ["aug", "aug"],
  ["sus2", "sus2"],
  ["sus4", "sus4"],
  ["6", "6"],
  ["m6", "m6"],
  ["maj7", "maj7"],
  ["7", "7"],
  ["m7", "m7"],
  ["mMaj7", "mMaj7"],
  ["m7b5", "m7b5"],
  ["dim7", "dim7"],
  ["aug7", "7#5"],
  ["augMaj7", "aug(maj7)"],
  ["maj9", "maj9"],
  ["9", "9"],
  ["m9", "m9"],
  ["11", "11"],
  ["m11", "m11"],
  ["13", "13"],
  ["maj13", "maj13"],
  ["m13", "m13"],
  ["7b9", "7b9"],
  ["7#9", "7#9"],
  ["7#11", "7#11"],
  ["7b13", "7b13"],
  ["7b5", "7b5"],
  ["7#5", "7#5"],
  ["alt", "7alt"],
  ["maj7#11", "maj7#11"],
  ["m9b5", "m9b5"],
  ["9sus4", "9sus4"],
  ["13sus4", "13sus4"],
  ["7b9sus4", "7b9sus4"],
  ["m6/9", "m6/9"],
  ["6/9", "6/9"],
  ["9b5", "9b5"],
] as const;

export const C0_REVIEWED_ALTERATION_FLAG_ENTRIES = [
  ["b5", "b5"],
  ["s5", "#5"],
  ["b9", "b9"],
  ["s9", "#9"],
  ["s11", "#11"],
  ["b13", "b13"],
] as const;

export const C0_REVIEWED_REPORT_GROUPS = [
  "preserved",
  "canonicalized",
  "custom",
  "ignored",
  "rejected",
] as const;

export const C0_REVIEWED_REPORT_CODES = {
  preserved: [
    "legacy.preserved.document_name",
    "legacy.preserved.document_description",
    "legacy.preserved.section_name",
    "legacy.preserved.annotation",
    "legacy.preserved.symbol",
    "legacy.preserved.manual_notes",
  ],
  canonicalized: [
    "legacy.canonicalized.document_title_default",
    "legacy.canonicalized.document_description_default",
    "legacy.canonicalized.section_name_default",
    "legacy.canonicalized.section_annotation_default",
    "legacy.canonicalized.event_annotation_default",
    "legacy.canonicalized.symbol_from_root_type",
    "legacy.canonicalized.auto_voicing_default",
    "legacy.canonicalized.meter_duration_default",
    "legacy.canonicalized.playback_default",
    "legacy.canonicalized.section_policy_default",
  ],
  custom: [
    "legacy.custom.name_notes_spelling_conflict",
    "legacy.custom.name_notes_sounding_conflict",
    "legacy.custom.constructed_notes_conflict",
    "legacy.custom.notes_without_symbol",
  ],
  ignored: [
    "legacy.ignored.ui_field",
    "legacy.ignored.voicing_metadata",
    "legacy.ignored.tensions",
    "legacy.ignored.alteration_evidence",
    "legacy.ignored.invalid_notes",
    "legacy.ignored.invalid_bass",
    "legacy.ignored.invalid_field_type",
    "legacy.ignored.unknown_field",
    "legacy.ignored.name_parse_failure",
    "legacy.ignored.unknown_type",
    "legacy.ignored.invalid_root",
  ],
  rejected: [
    "legacy.rejected.section_not_object",
    "legacy.rejected.section_chords_missing",
    "legacy.rejected.section_chords_not_array",
    "legacy.rejected.event_not_object",
    "legacy.rejected.no_usable_symbol_or_notes",
    "legacy.rejected.text_limit",
    "legacy.rejected.invalid_unicode_scalar",
  ],
} as const;

export const C0_REVIEWED_REFUSAL_CODES = [
  "limit.legacy_utf8_bytes_exceeded",
  "legacy.utf8_invalid",
  "legacy.json_syntax_invalid",
  "limit.legacy_json_depth_exceeded",
  "legacy.root_invalid",
  "legacy.sections_invalid",
  "limit.legacy_sections_exceeded",
  "limit.legacy_chords_per_section_exceeded",
  "limit.legacy_events_exceeded",
  "limit.legacy_source_properties_exceeded",
  "limit.legacy_report_items_exceeded",
  "legacy.id_factory_failed",
  "legacy.id_collision",
] as const;

export const C0_REVIEWED_LIMITS = {
  utf8Bytes: 2_097_152,
  jsonDepth: 32,
  sections: 64,
  chordsPerSection: 1_024,
  chordsTotal: 8_192,
  trustedNotesMinimum: 1,
  trustedNotesMaximum: 16,
  sourceProperties: 262_144,
  reportItems: 65_536,
  shortTextCodePoints: 256,
  longTextCodePoints: 2_000,
} as const;

export const C0_REVIEWED_WORK_MAXIMUMS = {
  bytesVisited: 2_097_153,
  sectionsVisited: 64,
  chordSlotsVisited: 8_192,
  notesVisited: 131_072,
  symbolParseCalls: 16_384,
  resolutionCalls: 16_384,
  idRequests: 16_449,
  identityMappings: 16_449,
  trackedRecords: 352_321,
} as const;

export const C0_REVIEWED_COUNTS = {
  companions: 6,
  adversarialCases: 70,
  presetChords: 80,
  presetExpectationRows: 80,
  mutationControls: 30,
  traces: 18,
  authorities: 7,
  types: 39,
  flags: 6,
  reportCodes: 38,
  refusalCodes: 13,
} as const;

const EXPECTED_PRESET_COUNTS = {
  sourceChords: 80,
  trustedNoteArrays: 80,
  parsedManual: 35,
  customManual: 45,
  directNameParsedManual: 34,
  rootTypeFallbackParsedManual: 1,
  directNameSpellingConflict: 6,
  directNameSoundingConflict: 25,
  rootTypeFallbackConflict: 12,
  noParseableSymbol: 2,
} as const;

const EXPECTED_CASE_PREFIX_COUNTS: Readonly<Record<string, number>> = {
  "C0-PRE": 16,
  "C0-NOTE": 12,
  "C0-LIMIT": 14,
  "C0-SHAPE": 10,
  "C0-ID": 6,
  "C0-REPORT": 7,
  "C0-APPLY": 5,
};

const EXPECTED_AUTHORITY_IDS = Array.from(
  { length: C0_REVIEWED_COUNTS.authorities },
  (_, index) => `C0-AUTH-${String(index + 1).padStart(3, "0")}`,
);

const EXPECTED_TRACE_IDS = Array.from(
  { length: C0_REVIEWED_COUNTS.traces },
  (_, index) => `C0-TRACE-${String(index + 1).padStart(3, "0")}`,
);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function rowObjects(value: unknown): readonly JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function addFinding(
  findings: C0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function expectEqual(
  findings: C0ContractFinding[],
  path: string,
  actual: unknown,
  expected: unknown,
  code = "contract.value_mismatch",
): void {
  if (!equalJson(actual, expected)) {
    addFinding(findings, code, path, "value differs from reviewed authority");
  }
}

function idsFromRows(rows: readonly JsonObject[]): readonly string[] {
  return rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
}

function allReportCodes(): readonly string[] {
  return C0_REVIEWED_REPORT_GROUPS.flatMap(
    (group) => C0_REVIEWED_REPORT_CODES[group],
  );
}

async function parseFixtures(
  fixtureRoot: string,
  findings: C0ContractFinding[],
): Promise<ReadonlyMap<string, Readonly<{ source: string; value: JsonObject }>>> {
  const parsed = new Map<string, Readonly<{ source: string; value: JsonObject }>>();
  let actualFiles: readonly string[];
  try {
    actualFiles = (await readdir(fixtureRoot))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    addFinding(findings, "fixture.directory_unreadable", fixtureRoot, "cannot read fixture directory");
    return parsed;
  }

  expectEqual(
    findings,
    fixtureRoot,
    actualFiles,
    [...EXPECTED_FILES].sort(),
    "fixture.file_set_mismatch",
  );

  for (const filename of EXPECTED_FILES) {
    const path = resolve(fixtureRoot, filename);
    try {
      const source = await readFile(path, "utf8");
      const candidate: unknown = JSON.parse(source);
      if (!isObject(candidate)) {
        addFinding(findings, "fixture.root_invalid", filename, "fixture root must be an object");
        continue;
      }
      parsed.set(filename, { source, value: candidate });
      expectEqual(
        findings,
        `${filename}.schema`,
        candidate.schema,
        EXPECTED_SCHEMAS[filename],
        "fixture.schema_mismatch",
      );
    } catch {
      addFinding(findings, "fixture.json_invalid", filename, "fixture is missing or invalid JSON");
    }
  }
  return parsed;
}

function validateContractFixture(
  contract: JsonObject | undefined,
  findings: C0ContractFinding[],
): void {
  if (contract === undefined) return;
  expectEqual(findings, "contract.package", contract.package, "C0");
  expectEqual(findings, "contract.operation", contract.operation, "migrateLegacyJson");
  expectEqual(findings, "contract.limits", contract.limits, C0_REVIEWED_LIMITS);
  expectEqual(
    findings,
    "contract.typeSuffixEntries",
    contract.typeSuffixEntries,
    C0_REVIEWED_TYPE_SUFFIX_ENTRIES,
  );
  expectEqual(
    findings,
    "contract.alterationFlagEntries",
    contract.alterationFlagEntries,
    C0_REVIEWED_ALTERATION_FLAG_ENTRIES,
  );
  const report = isObject(contract.report) ? contract.report : {};
  expectEqual(findings, "contract.report.groupOrder", report.groupOrder, C0_REVIEWED_REPORT_GROUPS);
  expectEqual(findings, "contract.report.codes", report.codes, C0_REVIEWED_REPORT_CODES);
  expectEqual(findings, "contract.refusalCodes", contract.refusalCodes, C0_REVIEWED_REFUSAL_CODES);
  const work = isObject(contract.work) ? contract.work : {};
  expectEqual(findings, "contract.work.maximums", work.maximums, C0_REVIEWED_WORK_MAXIMUMS);
  expectEqual(findings, "contract.reviewedCounts", contract.reviewedCounts, C0_REVIEWED_COUNTS);
  expectEqual(
    findings,
    "contract.reviewedCompanionDigests",
    contract.reviewedCompanionDigests,
    C0_REVIEWED_BYTE_DIGESTS,
  );

  const publication = isObject(contract.publication) ? contract.publication : {};
  expectEqual(findings, "contract.publication.validatedBrand", publication.validatedBrand, false);
  expectEqual(findings, "contract.publication.currentDocumentMutation", publication.currentDocumentMutation, false);
  const applicability = isObject(contract.applicability) ? contract.applicability : {};
  expectEqual(findings, "contract.applicability.wallTimeCutoff", applicability.wallTimeCutoff, "forbidden:counts-only");
}

const REVIEWED_LEGACY_NOTE_PATTERN =
  /^([A-G])(bb|##|b|#)?(0|-?[1-9][0-9]*)$/;

function reviewedNaturalSemitone(step: string): number {
  switch (step) {
    case "C": return 0;
    case "D": return 2;
    case "E": return 4;
    case "F": return 5;
    case "G": return 7;
    case "A": return 9;
    case "B": return 11;
    default: return Number.NaN;
  }
}

function reviewedAccidental(token: string | undefined): number {
  switch (token) {
    case "bb": return -2;
    case "b": return -1;
    case "#": return 1;
    case "##": return 2;
    case undefined: return 0;
    default: return Number.NaN;
  }
}

function reviewedLegacyMidi(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 5) return null;
  const match = REVIEWED_LEGACY_NOTE_PATTERN.exec(value);
  const step = match?.[1];
  const octaveText = match?.[3];
  if (step === undefined || octaveText === undefined) return null;
  const natural = reviewedNaturalSemitone(step);
  const accidental = reviewedAccidental(match?.[2]);
  const octave = Number(octaveText);
  const midi = 12 * (octave + 1) + natural + accidental;
  return Number.isSafeInteger(octave) && midi >= 0 && midi <= 127
    ? midi
    : null;
}

function hasReviewedDuplicateMidi(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<number>();
  for (const note of value) {
    const midi = reviewedLegacyMidi(note);
    if (midi === null) return false;
    if (seen.has(midi)) return true;
    seen.add(midi);
  }
  return false;
}

function validateAdversarialCases(
  fixture: JsonObject | undefined,
  findings: C0ContractFinding[],
): ReadonlySet<string> {
  const cases = rowObjects(fixture?.cases);
  const ids = idsFromRows(cases);
  if (cases.length !== C0_REVIEWED_COUNTS.adversarialCases) {
    addFinding(findings, "adversarial.count_mismatch", "adversarial-cases.json.cases", "expected 70 reviewed cases");
  }
  if (sortedUnique(ids).length !== ids.length) {
    addFinding(findings, "adversarial.id_duplicate", "adversarial-cases.json.cases", "case IDs must be unique strings");
  }
  for (const [prefix, expected] of Object.entries(EXPECTED_CASE_PREFIX_COUNTS)) {
    const actual = ids.filter((id) => id.startsWith(`${prefix}-`)).length;
    if (actual !== expected) {
      addFinding(
        findings,
        "adversarial.partition_mismatch",
        prefix,
        `expected ${String(expected)} cases`,
      );
    }
  }

  const idSet = new Set(ids);
  const reportCodeSet = new Set(allReportCodes());
  const refusalSet = new Set<string>(C0_REVIEWED_REFUSAL_CODES);
  for (const [index, testCase] of cases.entries()) {
    if (typeof testCase.id !== "string" || typeof testCase.dimension !== "string" || !isObject(testCase.expected)) {
      addFinding(
        findings,
        "adversarial.shape_invalid",
        `adversarial-cases.json.cases[${String(index)}]`,
        "id, dimension, and expected are required",
      );
      continue;
    }
    const expected = testCase.expected;
    for (const code of strings(expected.reportCodes)) {
      if (!reportCodeSet.has(code)) {
        addFinding(findings, "adversarial.report_code_unknown", `${testCase.id}.expected.reportCodes`, code);
      }
    }
    if (typeof expected.refusal === "string" && !refusalSet.has(expected.refusal)) {
      addFinding(findings, "adversarial.refusal_unknown", `${testCase.id}.expected.refusal`, expected.refusal);
    }
    if (typeof testCase.nearMissOf === "string" && !idSet.has(testCase.nearMissOf)) {
      addFinding(findings, "adversarial.near_miss_missing", `${testCase.id}.nearMissOf`, testCase.nearMissOf);
    }
    if (expected["reason"] === "duplicate projected MIDI") {
      const given = isObject(testCase["given"]) ? testCase["given"] : {};
      if (!hasReviewedDuplicateMidi(given["notes"])) {
        addFinding(
          findings,
          "adversarial.duplicate_midi_claim_invalid",
          `${testCase.id}.given.notes`,
          "reviewed duplicate-MIDI case must contain two notes with the same projected MIDI integer",
        );
      }
    }
  }
  return idSet;
}

function validatePresetCorpus(
  sourceFixture: JsonObject | undefined,
  expectationFixture: JsonObject | undefined,
  findings: C0ContractFinding[],
): ReadonlySet<string> {
  const presets = rowObjects(sourceFixture?.presets);
  const sourceIds: string[] = [];
  let sections = 0;
  let chords = 0;
  for (const preset of presets) {
    const presetId = typeof preset.legacyPresetId === "string" ? preset.legacyPresetId : "";
    for (const [sectionIndex, section] of rowObjects(preset.sections).entries()) {
      sections += 1;
      for (const chordIndex of rowObjects(section.chords).keys()) {
        chords += 1;
        sourceIds.push(
          `${presetId}:${String(sectionIndex)}:${String(chordIndex)}`,
        );
      }
    }
  }
  expectEqual(findings, "legacy-presets-source.json.counts", sourceFixture?.counts, { presets: 3, sections: 6, chords: 80 });
  if (presets.length !== 3 || sections !== 6 || chords !== 80) {
    addFinding(findings, "preset.source_count_mismatch", "legacy-presets-source.json.presets", "expected 3 presets, 6 sections, and 80 chords");
  }
  if (sortedUnique(sourceIds).length !== sourceIds.length) {
    addFinding(findings, "preset.source_id_duplicate", "legacy-presets-source.json.presets", "derived source IDs must be unique");
  }

  const categories = [
    "directNameParsedManual",
    "rootTypeFallbackParsedManual",
    "directNameSpellingConflict",
    "directNameSoundingConflict",
    "rootTypeFallbackConflict",
    "noParseableSymbol",
  ] as const;
  const expectationIds = categories.flatMap((category) =>
    idsFromRows(rowObjects(expectationFixture?.[category])),
  );
  expectEqual(findings, "preset-expectations.json.expectedCounts", expectationFixture?.expectedCounts, EXPECTED_PRESET_COUNTS);
  if (expectationIds.length !== C0_REVIEWED_COUNTS.presetExpectationRows) {
    addFinding(findings, "preset.expectation_count_mismatch", "preset-expectations.json", "expected one classification for each of 80 chords");
  }
  if (sortedUnique(expectationIds).length !== expectationIds.length) {
    addFinding(findings, "preset.expectation_id_duplicate", "preset-expectations.json", "expectation categories must be disjoint");
  }
  expectEqual(
    findings,
    "preset expectation coverage",
    sortedUnique(expectationIds),
    sortedUnique(sourceIds),
    "preset.expectation_coverage_mismatch",
  );
  return new Set(sourceIds);
}

function validateLedgers(
  mutationFixture: JsonObject | undefined,
  provenanceFixture: JsonObject | undefined,
  traceFixture: JsonObject | undefined,
  adversarialIds: ReadonlySet<string>,
  presetIds: ReadonlySet<string>,
  findings: C0ContractFinding[],
): void {
  const authorities = rowObjects(provenanceFixture?.authorities);
  const authorityIds = idsFromRows(authorities);
  expectEqual(findings, "provenance authority IDs", authorityIds, EXPECTED_AUTHORITY_IDS, "provenance.authority_set_mismatch");

  const traces = rowObjects(traceFixture?.traces);
  const traceIds = idsFromRows(traces);
  expectEqual(findings, "trace IDs", traceIds, EXPECTED_TRACE_IDS, "trace.id_set_mismatch");
  const authoritySet = new Set(authorityIds);
  const tracedAdversarialIds = new Set<string>();
  for (const trace of traces) {
    const id = typeof trace.id === "string" ? trace.id : "trace-without-id";
    if (typeof trace.requirement !== "string" || trace.requirement.length === 0) {
      addFinding(findings, "trace.requirement_missing", id, "trace requires a nonempty parent requirement");
    }
    for (const authorityId of strings(trace.authorityIds)) {
      if (!authoritySet.has(authorityId)) addFinding(findings, "trace.authority_missing", id, authorityId);
    }
    for (const fixtureId of strings(trace.fixtureIds)) {
      if (fixtureId !== "preset-expectations:all-80" && !adversarialIds.has(fixtureId)) {
        addFinding(findings, "trace.fixture_missing", id, fixtureId);
      } else if (fixtureId !== "preset-expectations:all-80") {
        tracedAdversarialIds.add(fixtureId);
      }
    }
  }
  expectEqual(
    findings,
    "trace adversarial coverage",
    sortedUnique([...tracedAdversarialIds]),
    sortedUnique([...adversarialIds]),
    "trace.adversarial_coverage_mismatch",
  );

  const controls = rowObjects(mutationFixture?.controls);
  const controlIds = idsFromRows(controls);
  const expectedControlIds = Array.from(
    { length: C0_REVIEWED_COUNTS.mutationControls },
    (_, index) => `C0-MUT-${String(index + 1).padStart(3, "0")}`,
  );
  expectEqual(findings, "mutation control IDs", controlIds, expectedControlIds, "mutation.id_set_mismatch");
  const allowedTargets = new Set<string>(C0_REVIEWED_COMPANIONS);
  const knownLinks = new Set([...adversarialIds, ...presetIds, ...authorityIds, ...traceIds]);
  for (const control of controls) {
    const id = typeof control.id === "string" ? control.id : "control-without-id";
    if (typeof control.targetFile !== "string" || !allowedTargets.has(control.targetFile)) {
      addFinding(findings, "mutation.target_invalid", id, "target must be a reviewed companion");
    }
    if (typeof control.linkedCaseId !== "string" || !knownLinks.has(control.linkedCaseId)) {
      addFinding(findings, "mutation.link_missing", id, "linked reviewed case or trace does not exist");
    }
    if (typeof control.fault !== "string" || control.fault.length === 0) {
      addFinding(findings, "mutation.fault_missing", id, "control requires a described fault");
    }
  }
}

export async function validateC0Contract(
  fixtureRoot = resolve("tests/fixtures/legacy-migration"),
): Promise<C0ContractValidationReport> {
  const findings: C0ContractFinding[] = [];
  const parsed = await parseFixtures(fixtureRoot, findings);

  for (const filename of C0_REVIEWED_COMPANIONS) {
    const fixture = parsed.get(filename);
    if (fixture !== undefined && sha256(fixture.source) !== C0_REVIEWED_BYTE_DIGESTS[filename]) {
      addFinding(findings, "companion.digest_mismatch", filename, "reviewed companion bytes changed");
    }
  }

  const contractFixture = parsed.get(CONTRACT_FILENAME);
  if (
    contractFixture !== undefined &&
    sha256(contractFixture.source) !== C0_REVIEWED_CONTRACT_BYTE_DIGEST
  ) {
    addFinding(
      findings,
      "contract.digest_mismatch",
      CONTRACT_FILENAME,
      "reviewed machine contract bytes changed",
    );
  }
  const contract = contractFixture?.value;
  validateContractFixture(contract, findings);
  const adversarial = parsed.get("adversarial-cases.json")?.value;
  const source = parsed.get("legacy-presets-source.json")?.value;
  const expectations = parsed.get("preset-expectations.json")?.value;
  const adversarialIds = validateAdversarialCases(adversarial, findings);
  const presetIds = validatePresetCorpus(source, expectations, findings);
  validateLedgers(
    parsed.get("mutation-controls.json")?.value,
    parsed.get("provenance-ledger.json")?.value,
    parsed.get("trace-ledger.json")?.value,
    adversarialIds,
    presetIds,
    findings,
  );

  const reportCodes = allReportCodes().length;
  const counts = {
    companions: C0_REVIEWED_COMPANIONS.filter((filename) => parsed.has(filename)).length,
    adversarialCases: rowObjects(adversarial?.cases).length,
    presetChords: presetIds.size,
    presetExpectationRows: [
      "directNameParsedManual",
      "rootTypeFallbackParsedManual",
      "directNameSpellingConflict",
      "directNameSoundingConflict",
      "rootTypeFallbackConflict",
      "noParseableSymbol",
    ].reduce((sum, key) => sum + rowObjects(expectations?.[key]).length, 0),
    mutationControls: rowObjects(parsed.get("mutation-controls.json")?.value.controls).length,
    traces: rowObjects(parsed.get("trace-ledger.json")?.value.traces).length,
    authorities: rowObjects(parsed.get("provenance-ledger.json")?.value.authorities).length,
    types: C0_REVIEWED_TYPE_SUFFIX_ENTRIES.length,
    flags: C0_REVIEWED_ALTERATION_FLAG_ENTRIES.length,
    reportCodes,
    refusalCodes: C0_REVIEWED_REFUSAL_CODES.length,
  };

  return {
    schema: "changes.validation.c0-contract.v1",
    package: "C0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts,
    findings,
  };
}

if (import.meta.main) {
  const report = await validateC0Contract();
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
