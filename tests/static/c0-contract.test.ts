import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";

import {
  LEGACY_ALTERATION_FLAG_ENTRIES,
  LEGACY_AUTO_VOICING_DEFAULT,
  LEGACY_CANONICALIZED_CODES,
  LEGACY_CUSTOM_CODES,
  LEGACY_DOCUMENT_DEFAULTS,
  LEGACY_IGNORED_CODES,
  LEGACY_MIGRATION_APPLICABILITY,
  LEGACY_MIGRATION_CANDIDATE_SCHEMA,
  LEGACY_MIGRATION_CONTRACT_SCHEMA,
  LEGACY_MIGRATION_OPERATION_NAMES,
  LEGACY_MIGRATION_POLICY_ID,
  LEGACY_MIGRATION_POLICY_VERSION,
  LEGACY_MIGRATION_REFUSAL_CODES,
  LEGACY_MIGRATION_REPORT_SCHEMA,
  LEGACY_MIGRATION_TERMINATIONS,
  LEGACY_MIGRATION_WORK_COUNTER_NAMES,
  LEGACY_PITCH_CLASS_PATTERN_SOURCE,
  LEGACY_PRESERVED_CODES,
  LEGACY_REJECTED_CODES,
  LEGACY_REPORT_GROUPS,
  LEGACY_SCIENTIFIC_PITCH_PATTERN_SOURCE,
  LEGACY_TYPE_SUFFIX_ENTRIES,
  MAX_LEGACY_BYTES_VISITED,
  MAX_LEGACY_CHORDS,
  MAX_LEGACY_CHORDS_PER_SECTION,
  MAX_LEGACY_CHORD_SLOTS_VISITED,
  MAX_LEGACY_IDENTITY_MAPPINGS,
  MAX_LEGACY_ID_REQUESTS,
  MAX_LEGACY_JSON_DEPTH,
  MAX_LEGACY_LONG_TEXT_CODE_POINTS,
  MAX_LEGACY_NOTES_VISITED,
  MAX_LEGACY_REPORT_ITEMS,
  MAX_LEGACY_RESOLUTION_CALLS,
  MAX_LEGACY_SECTIONS,
  MAX_LEGACY_SECTIONS_VISITED,
  MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
  MAX_LEGACY_SOURCE_PROPERTIES,
  MAX_LEGACY_SYMBOL_PARSE_CALLS,
  MAX_LEGACY_TRACKED_RECORDS,
  MAX_LEGACY_UTF8_BYTES,
  MAX_TRUSTED_LEGACY_NOTES,
  MIN_TRUSTED_LEGACY_NOTES,
  type LegacyMigrationCandidate,
  type LegacyMigrationDependencies,
  type LegacyMigrationOperations,
  type LegacyMigrationRefusal,
  type LegacyMigrationRefusalCode,
  type LegacyMigrationReport,
  type LegacyMigrationRequest,
  type LegacyMigrationResult,
  type LegacyMigrationWorkCounters,
  type LegacyReportGroup,
  type LegacyReportItem,
} from "../../src/compatibility";
import type {
  ProgressionDocumentShapeV2,
  ValidatedDocument,
} from "../../src/domain";
import {
  C0_REVIEWED_ALTERATION_FLAG_ENTRIES,
  C0_REVIEWED_BYTE_DIGESTS,
  C0_REVIEWED_COMPANIONS,
  C0_REVIEWED_CONTRACT_BYTE_DIGEST,
  C0_REVIEWED_COUNTS,
  C0_REVIEWED_LIMITS,
  C0_REVIEWED_REFUSAL_CODES,
  C0_REVIEWED_REPORT_CODES,
  C0_REVIEWED_REPORT_GROUPS,
  C0_REVIEWED_TYPE_SUFFIX_ENTRIES,
  C0_REVIEWED_WORK_MAXIMUMS,
  validateC0Contract,
  type C0ContractValidationReport,
} from "../../scripts/validate-c0-contract";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;
type Assert<Value extends true> = Value;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Not<Value extends boolean> = Value extends true ? false : true;

type Success = Extract<LegacyMigrationResult, { ok: true }>;
type Failure = Extract<LegacyMigrationResult, { ok: false }>;

const typeAssertions: readonly [
  Assert<Equal<LegacyMigrationCandidate["document"], ProgressionDocumentShapeV2>>,
  Assert<Not<ProgressionDocumentShapeV2 extends ValidatedDocument ? true : false>>,
  Assert<Equal<keyof Success, "ok" | "value">>,
  Assert<Equal<keyof Failure, "ok" | "refusal">>,
  Assert<Equal<Failure["refusal"], LegacyMigrationRefusal>>,
  Assert<Equal<LegacyMigrationRefusal["code"], LegacyMigrationRefusalCode>>,
  Assert<Equal<keyof LegacyMigrationOperations, "migrateLegacyJson">>,
  Assert<Equal<LegacyMigrationRequest["sourceBytes"], Uint8Array>>,
  Assert<
    Equal<
      keyof LegacyMigrationDependencies,
      "idFactory" | "parseChordSymbol" | "resolveChord"
    >
  >,
  Assert<Equal<keyof LegacyMigrationReport["groups"], LegacyReportGroup>>,
  Assert<Equal<keyof LegacyReportItem, "code" | "group" | "sourcePath" | "targetPath">>,
  Assert<
    Equal<
      keyof LegacyMigrationWorkCounters,
      | "bytesVisited"
      | "chordSlotsVisited"
      | "idRequests"
      | "jsonCodeUnitsVisited"
      | "maximumJsonDepth"
      | "notesVisited"
      | "reportItemsEmitted"
      | "resolutionCalls"
      | "sectionsVisited"
      | "sourcePropertiesVisited"
      | "symbolParseCalls"
    >
  >,
] = [true, true, true, true, true, true, true, true, true, true, true, true];

const fixtureRoot = new URL(
  "../fixtures/legacy-migration",
  import.meta.url,
).pathname;
const contractSourcePath = new URL(
  "../../src/compatibility/legacy-migration-contract.ts",
  import.meta.url,
).pathname;
const contractDocPath = new URL(
  "../../docs/C0_LEGACY_MIGRATION_CONTRACT.md",
  import.meta.url,
).pathname;
const architecturePath = new URL(
  "../../docs/ARCHITECTURE.md",
  import.meta.url,
).pathname;
const packagePath = new URL("../../package.json", import.meta.url).pathname;
const verifyPath = new URL("../../scripts/verify.ts", import.meta.url).pathname;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`C0_TEST_OBJECT: ${label}`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`C0_TEST_ARRAY: ${label}`);
  return value;
}

async function readJsonObject(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")), path);
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJsonObject(path);
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "jcpe c0 contract Ω path-"));
  const root = join(parent, "reviewed legacy fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function findingCodes(report: C0ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<void> {
  const report = await validateC0Contract(root);
  expect(report.outcome).toBe("fail");
  const actual = findingCodes(report);
  for (const code of codes) expect(actual).toContain(code);
}

describe("C0 reviewed legacy migration contract", () => {
  test("public types and constants match the reviewed machine authority", () => {
    expect(typeAssertions).toHaveLength(12);
    expect(LEGACY_MIGRATION_CONTRACT_SCHEMA).toBe(
      "changes.compatibility.legacy-migration-contract.v1",
    );
    expect(LEGACY_MIGRATION_CANDIDATE_SCHEMA).toBe(
      "changes.compatibility.legacy-migration-candidate.v1",
    );
    expect(LEGACY_MIGRATION_REPORT_SCHEMA).toBe(
      "changes.compatibility.legacy-migration-report.v1",
    );
    expect([
      LEGACY_MIGRATION_POLICY_ID,
      LEGACY_MIGRATION_POLICY_VERSION,
    ]).toEqual(["changes.legacy-migration", 1]);
    expect(LEGACY_MIGRATION_OPERATION_NAMES).toEqual(["migrateLegacyJson"]);
    expect(
      LEGACY_TYPE_SUFFIX_ENTRIES.map(
        ({ type, suffix }) => [type, suffix] as const,
      ),
    ).toEqual([...C0_REVIEWED_TYPE_SUFFIX_ENTRIES]);
    expect(
      LEGACY_ALTERATION_FLAG_ENTRIES.map(
        ({ field, modifier }) => [field, modifier] as const,
      ),
    ).toEqual([...C0_REVIEWED_ALTERATION_FLAG_ENTRIES]);
    expect(LEGACY_REPORT_GROUPS).toEqual(C0_REVIEWED_REPORT_GROUPS);
    expect({
      preserved: LEGACY_PRESERVED_CODES,
      canonicalized: LEGACY_CANONICALIZED_CODES,
      custom: LEGACY_CUSTOM_CODES,
      ignored: LEGACY_IGNORED_CODES,
      rejected: LEGACY_REJECTED_CODES,
    }).toEqual(C0_REVIEWED_REPORT_CODES);
    expect(LEGACY_MIGRATION_REFUSAL_CODES).toEqual(
      C0_REVIEWED_REFUSAL_CODES,
    );
    expect({
      utf8Bytes: MAX_LEGACY_UTF8_BYTES,
      jsonDepth: MAX_LEGACY_JSON_DEPTH,
      sections: MAX_LEGACY_SECTIONS,
      chordsPerSection: MAX_LEGACY_CHORDS_PER_SECTION,
      chordsTotal: MAX_LEGACY_CHORDS,
      trustedNotesMinimum: MIN_TRUSTED_LEGACY_NOTES,
      trustedNotesMaximum: MAX_TRUSTED_LEGACY_NOTES,
      sourceProperties: MAX_LEGACY_SOURCE_PROPERTIES,
      reportItems: MAX_LEGACY_REPORT_ITEMS,
      shortTextCodePoints: MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
      longTextCodePoints: MAX_LEGACY_LONG_TEXT_CODE_POINTS,
    }).toEqual(C0_REVIEWED_LIMITS);
    expect({
      bytesVisited: MAX_LEGACY_BYTES_VISITED,
      sectionsVisited: MAX_LEGACY_SECTIONS_VISITED,
      chordSlotsVisited: MAX_LEGACY_CHORD_SLOTS_VISITED,
      notesVisited: MAX_LEGACY_NOTES_VISITED,
      symbolParseCalls: MAX_LEGACY_SYMBOL_PARSE_CALLS,
      resolutionCalls: MAX_LEGACY_RESOLUTION_CALLS,
      idRequests: MAX_LEGACY_ID_REQUESTS,
      identityMappings: MAX_LEGACY_IDENTITY_MAPPINGS,
      trackedRecords: MAX_LEGACY_TRACKED_RECORDS,
    }).toEqual(C0_REVIEWED_WORK_MAXIMUMS);
    expect(LEGACY_PITCH_CLASS_PATTERN_SOURCE).toBe(
      "^[A-G](?:bb|##|b|#)?$",
    );
    expect(LEGACY_SCIENTIFIC_PITCH_PATTERN_SOURCE).toBe(
      "^[A-G](?:bb|##|b|#)?(?:0|-?[1-9][0-9]*)$",
    );
    expect(LEGACY_MIGRATION_TERMINATIONS).toEqual([
      "complete-candidate",
      "complete-refusal",
    ]);
    expect(LEGACY_MIGRATION_WORK_COUNTER_NAMES).toHaveLength(11);
  });

  test("defaults and applicability are exact and publication-safe", () => {
    expect(LEGACY_DOCUMENT_DEFAULTS).toEqual({
      title: "Imported legacy progression",
      description: "",
      meter: { beatsPerBar: 4, beatUnit: 4 },
      tempoBpm: 120,
      key: null,
      playback: {
        instrumentId: "mellow-keys",
        masterVolume: 0.8,
        reverbAmount: 0.2,
        countInBars: 0,
      },
      sectionNamePrefix: "Section ",
      sectionAnnotation: "",
      sectionKeyOverride: null,
      sectionVoiceLeadingBoundary: "reset",
      eventDuration: { numerator: 4, denominator: 1 },
      measureCompletion: "complete",
      eventAnnotation: "",
    });
    expect(LEGACY_AUTO_VOICING_DEFAULT).toEqual({
      mode: "auto",
      family: "balanced",
      voiceCount: 4,
      range: { lowMidi: 48, highMidi: 84 },
      bassPolicy: "generated",
    });
    expect(LEGACY_MIGRATION_APPLICABILITY).toEqual({
      cancellation: "not-applicable:synchronous-bounded",
      staleRevision: "not-applicable:value-operation-without-publication",
      resume: "not-applicable:non-resumable",
      wallTimeCutoff: "forbidden:counts-only",
      publication: "candidate-only:application-f3-gate-required",
    });
  });

  test("the reviewed fixture package validates independently", async () => {
    const report = await validateC0Contract(fixtureRoot);
    expect(report).toEqual({
      schema: "changes.validation.c0-contract.v1",
      package: "C0",
      outcome: "pass",
      counts: C0_REVIEWED_COUNTS,
      findings: [],
    });
    expect(Object.keys(C0_REVIEWED_BYTE_DIGESTS).sort()).toEqual(
      [...C0_REVIEWED_COMPANIONS].sort(),
    );
    expect(C0_REVIEWED_CONTRACT_BYTE_DIGEST).toHaveLength(64);
  });

  test("all 30 reviewed companion mutations break the byte authority", async () => {
    await withFixtureCopy(async (root) => {
      const mutationFixture = await readJsonObject(
        join(root, "mutation-controls.json"),
      );
      const controls = requireArray(
        mutationFixture["controls"],
        "mutation controls",
      ).map((entry, index) =>
        requireObject(entry, `mutation control ${String(index)}`),
      );
      expect(controls).toHaveLength(30);

      for (const control of controls) {
        const id = control["id"];
        const targetFile = control["targetFile"];
        if (typeof id !== "string" || typeof targetFile !== "string") {
          throw new Error("C0_TEST_MUTATION_CONTROL_SHAPE");
        }
        const path = join(root, targetFile);
        const original = await readFile(path, "utf8");
        try {
          await mutateJson(root, targetFile, (value) => {
            value["mutationProbe"] = id;
          });
          await expectRejected(root, "companion.digest_mismatch");
        } finally {
          await writeFile(path, original, "utf8");
        }
      }
    });
  });

  test("semantic mutations are diagnosed in addition to digest tampering", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (value) => {
        const first = requireObject(
          requireArray(value["cases"], "cases")[0],
          "first case",
        );
        const expected = requireObject(first["expected"], "first expected");
        expected["reportCodes"] = ["legacy.ignored.not-a-reviewed-code"];
      });
      await expectRejected(
        root,
        "companion.digest_mismatch",
        "adversarial.report_code_unknown",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "adversarial-cases.json", (value) => {
        const noteCase = requireArray(value["cases"], "cases")
          .map((entry, index) =>
            requireObject(entry, `case ${String(index)}`),
          )
          .find((entry) => entry["id"] === "C0-NOTE-010");
        if (noteCase === undefined) {
          throw new Error("C0_TEST_NOTE_010_MISSING");
        }
        const given = requireObject(noteCase["given"], "C0-NOTE-010 given");
        given["notes"] = ["C##4", "Dbb4"];
      });
      await expectRejected(
        root,
        "companion.digest_mismatch",
        "adversarial.duplicate_midi_claim_invalid",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "preset-expectations.json", (value) => {
        const rows = requireArray(
          value["directNameParsedManual"],
          "parsed expectations",
        );
        const first = requireObject(rows[0], "first parsed expectation");
        const second = requireObject(rows[1], "second parsed expectation");
        first["id"] = second["id"];
      });
      await expectRejected(
        root,
        "companion.digest_mismatch",
        "preset.expectation_id_duplicate",
        "preset.expectation_coverage_mismatch",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const first = requireObject(
          requireArray(value["traces"], "traces")[0],
          "first trace",
        );
        first["authorityIds"] = ["C0-AUTH-999"];
      });
      await expectRejected(
        root,
        "companion.digest_mismatch",
        "trace.authority_missing",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const trace = requireArray(value["traces"], "traces")
          .map((entry, index) =>
            requireObject(entry, `trace ${String(index)}`),
          )
          .find((entry) => entry["id"] === "C0-TRACE-017");
        if (trace === undefined) {
          throw new Error("C0_TEST_TRACE_017_MISSING");
        }
        trace["fixtureIds"] = ["C0-SHAPE-008", "C0-SHAPE-010"];
      });
      await expectRejected(
        root,
        "companion.digest_mismatch",
        "trace.adversarial_coverage_mismatch",
      );
    });

    await withFixtureCopy(async (root) => {
      await mutateJson(root, "c0-legacy-migration-contract.json", (value) => {
        const publication = requireObject(value["publication"], "publication");
        publication["validatedBrand"] = true;
      });
      await expectRejected(root, "contract.value_mismatch");
    });
  });

  test("the contract module remains declarative and inside compatibility boundaries", async () => {
    const source = await readFile(contractSourcePath, "utf8");
    const sourceFile = ts.createSourceFile(
      contractSourcePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports = sourceFile.statements.filter(ts.isImportDeclaration);
    expect(
      imports.map((statement) =>
        ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : "invalid",
      ),
    ).toEqual(["../domain", "../theory"]);
    const theoryImport = imports.find(
      (statement) =>
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === "../theory",
    );
    expect(theoryImport?.importClause?.phaseModifier).toBe(
      ts.SyntaxKind.TypeKeyword,
    );
    expect(
      sourceFile.statements.filter(ts.isFunctionDeclaration),
    ).toHaveLength(0);
    expect(source).not.toContain("ValidatedDocument");
    expect(source).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|Date)\b/u);
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("application/");
    expect(source).not.toContain("audio/");
    expect(source).not.toContain("content/");
  });

  test("the handoff and stable commands expose the complete C0 authority", async () => {
    const [doc, architecture, packageSource, verifySource] = await Promise.all([
      readFile(contractDocPath, "utf8"),
      readFile(architecturePath, "utf8"),
      readFile(packagePath, "utf8"),
      readFile(verifyPath, "utf8"),
    ]);
    for (const phrase of [
      "fatal UTF-8",
      "one single returned realization",
      "Custom plus exact Manual",
      "F3 remains the only semantic publication gate",
      "wall-time cutoff is forbidden",
      "all 80 chords",
      "30 reviewed corruptions",
    ]) {
      expect(doc).toContain(phrase);
    }
    const packageJson = requireObject(JSON.parse(packageSource), "package");
    const scripts = requireObject(packageJson["scripts"], "package scripts");
    expect(scripts["validate:c0-contract"]).toBe(
      "bun scripts/validate-c0-contract.ts",
    );
    expect(scripts["verify:c0-evidence"]).toBe(
      "bun scripts/verify-c0-evidence.ts",
    );
    expect(architecture).toContain("bun run validate:c0-contract");
    expect(architecture).toContain("bun run verify:c0-evidence");
    expect(verifySource).toContain('id: "c0-legacy-migration-contract"');
    expect(verifySource).toContain('id: "c0-evidence"');
  });
});
