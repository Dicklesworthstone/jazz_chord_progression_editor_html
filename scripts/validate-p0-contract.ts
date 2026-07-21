import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type P0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type P0ContractValidationReport = Readonly<{
  schema: "changes.validation.p0-contract.v1";
  package: "P0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    files: number;
    sources: number;
    timelineCases: number;
    realizationCases: number;
    loopCases: number;
    lawCases: number;
    structuralLimitCases: number;
    counterBoundaryCases: number;
    totalNamedCases: number;
    mutationControls: number;
    authorities: number;
    traces: number;
  }>;
  findings: readonly P0ContractFinding[];
}>;

type ParsedFixture = Readonly<{
  filename: P0FixtureFilename;
  path: string;
  source: string;
  root: JsonObject;
  byteDigest: string;
}>;

const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/playback-plan",
);

const CONTRACT_FILENAME = "p0-playback-plan-contract.json" as const;

export const P0_REVIEWED_COMPANIONS = Object.freeze([
  "law-cases.json",
  "limit-cases.json",
  "loop-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "realization-cases.json",
  "source-catalog.json",
  "timeline-cases.json",
  "trace-ledger.json",
] as const);

const EXPECTED_FILES = Object.freeze([
  ...P0_REVIEWED_COMPANIONS.slice(0, 4),
  CONTRACT_FILENAME,
  ...P0_REVIEWED_COMPANIONS.slice(4),
] as const);
type P0FixtureFilename = (typeof EXPECTED_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<P0FixtureFilename, string>> = {
  "law-cases.json": "changes.fixtures.p0-law-cases.v1",
  "limit-cases.json": "changes.fixtures.p0-limit-cases.v1",
  "loop-cases.json": "changes.fixtures.p0-loop-cases.v1",
  "mutation-controls.json": "changes.fixtures.p0-mutation-controls.v1",
  "p0-playback-plan-contract.json":
    "changes.fixtures.p0-playback-plan-contract.v1",
  "provenance-ledger.json": "changes.fixtures.p0-provenance-ledger.v1",
  "realization-cases.json": "changes.fixtures.p0-realization-cases.v1",
  "source-catalog.json": "changes.fixtures.p0-source-catalog.v1",
  "timeline-cases.json": "changes.fixtures.p0-timeline-cases.v1",
  "trace-ledger.json": "changes.fixtures.p0-trace-ledger.v1",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<
  Record<P0FixtureFilename, readonly string[]>
> = {
  "law-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "lawPolicy",
    "productionOutputUsed",
    "schema",
    "status",
  ],
  "limit-cases.json": [
    "authorityIds",
    "counterBoundaries",
    "counterPlusOneCommonExpectation",
    "expectedValuesGenerated",
    "fixtureVersion",
    "limitPolicy",
    "limits",
    "productionOutputUsed",
    "schema",
    "status",
    "structuralCases",
    "traceIds",
  ],
  "loop-cases.json": [
    "baseDocumentRecipe",
    "cases",
    "commonExpectedPlan",
    "emissionExpansionPolicy",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "sourceCatalog",
    "sourceTimeline",
    "status",
  ],
  "mutation-controls.json": [
    "claim",
    "controls",
    "executionOwner",
    "expectedValuesGenerated",
    "fixtureVersion",
    "humanReviewClaimed",
    "productionOutputUsed",
    "schema",
    "status",
  ],
  "p0-playback-plan-contract.json": [
    "applicability",
    "articulationKinds",
    "articulationPolicy",
    "authorityIds",
    "coverageSummary",
    "declaredFiles",
    "expectedValuesGenerated",
    "fixtureVersion",
    "generatedCandidateInvalidReasons",
    "handoff",
    "identity",
    "independence",
    "legacyRegressionOwnership",
    "limits",
    "loopPolicy",
    "outputPolicy",
    "ownership",
    "productionOutputUsed",
    "realizationPolicy",
    "refusalPrecedence",
    "requestPolicy",
    "reviewedFileSha256",
    "schema",
    "status",
    "terminations",
    "timelinePolicy",
    "traceIds",
    "validationOrdering",
    "velocityPolicy",
    "workIncrementPolicy",
  ],
  "provenance-ledger.json": [
    "authoringStatement",
    "authorities",
    "authorityClasses",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "status",
  ],
  "realization-cases.json": [
    "baseRecipe",
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "mutationProtocol",
    "productionOutputUsed",
    "schema",
    "sourceCatalog",
    "status",
  ],
  "source-catalog.json": [
    "expectedValuesGenerated",
    "fixtureVersion",
    "materializationPolicy",
    "productionOutputUsed",
    "schema",
    "sources",
    "status",
  ],
  "timeline-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "projectionPolicy",
    "schema",
    "sourceCatalog",
    "status",
  ],
  "trace-ledger.json": [
    "expectedValuesGenerated",
    "fixtureVersion",
    "parentClaims",
    "productionOutputUsed",
    "schema",
    "stableTraceIdsOnly",
    "status",
    "tracePolicy",
    "traces",
  ],
};

export const P0_REVIEWED_BYTE_DIGESTS: Readonly<
  Record<P0FixtureFilename, string>
> = {
  "law-cases.json":
    "efb68475fb0729b614b9cccc1009fbb7a13068c0fe07cceff6a9b3d3b0db2bc4",
  "limit-cases.json":
    "47dabc1bb2a2d86d6d5f8010562a9d7763808330b58c86f608d7558355a5fa3b",
  "loop-cases.json":
    "6ed838354215b0c791656ee22bcb8128153de0863276c96dfdf6a5fef197be51",
  "mutation-controls.json":
    "302930f95274e2470a90f4b7092fac9cd9cf442df55636b1f418a5eccadbb83c",
  "p0-playback-plan-contract.json":
    "96b726490b697ce3e90a6010520c8ed90cc6cfc1eab66063af040286abe4a2da",
  "provenance-ledger.json":
    "04008e480059d5d199ca66ce014f7958c95858b3adc68fdb4ea0d1d42a2a63f8",
  "realization-cases.json":
    "b07700379f2aa8196b779f3217f150d76181d3247ea5f7ff4382cbcd91f700bb",
  "source-catalog.json":
    "525afbbff7e27a74f4f58e833e51d4393b3a85f5ad386f21b7513c4159f5ff48",
  "timeline-cases.json":
    "56fdeb70a70a88500b2453e6e5426f81c03970488f59d32a952ce85b25547d43",
  "trace-ledger.json":
    "7df35befb6059b7e6ae27dcf4cff19708408657cb67adc41b20b51902f6b1c32",
};

export const P0_EXPECTED_COUNTS = Object.freeze({
  files: 10,
  sources: 6,
  timelineCases: 10,
  realizationCases: 23,
  loopCases: 14,
  lawCases: 14,
  structuralLimitCases: 6,
  counterBoundaryCases: 16,
  totalNamedCases: 83,
  mutationControls: 42,
  authorities: 11,
  traces: 20,
} as const);

export const P0_REVIEWED_TRACE_IDS = Object.freeze([
  "P0-TRACE-BOUNDARY",
  "P0-TRACE-CONSUMERS",
  "P0-TRACE-CUSTOM",
  "P0-TRACE-DETERMINISM",
  "P0-TRACE-EMPTY-PARTIAL",
  "P0-TRACE-GATE",
  "P0-TRACE-IMMUTABILITY",
  "P0-TRACE-LEGACY",
  "P0-TRACE-LIMITS",
  "P0-TRACE-LOOP",
  "P0-TRACE-METERS",
  "P0-TRACE-MIDI",
  "P0-TRACE-REALIZATION",
  "P0-TRACE-REFUSALS",
  "P0-TRACE-SOURCE-IDS",
  "P0-TRACE-STALE",
  "P0-TRACE-STORED",
  "P0-TRACE-T0",
  "P0-TRACE-TIMELINE",
  "P0-TRACE-TRANSPOSITION",
] as const);

export const P0_REVIEWED_AUTHORITY_IDS = Object.freeze([
  "P0-AUTH-ARCHITECTURE",
  "P0-AUTH-CONTRACT",
  "P0-AUTH-DOMAIN",
  "P0-AUTH-F3",
  "P0-AUTH-INDEPENDENCE",
  "P0-AUTH-LEGACY",
  "P0-AUTH-LIMITS",
  "P0-AUTH-POLICY",
  "P0-AUTH-T0",
  "P0-AUTH-T1",
  "P0-AUTH-V0",
] as const);

const EXPECTED_STATUS = "independently-authored-pre-production";
const EXPECTED_FIXTURE_VERSION = "1.0.0";
const MIDI_PPQ = 960;
const RELEASE_GAP_TICKS = 24;
const EXPECTED_TERMINATION_BY_REFUSAL = Object.freeze({
  "playback.request_schema_invalid": "request-invalid",
  "playback.compiler_identity_invalid": "request-invalid",
  "playback.policy_identity_invalid": "request-invalid",
  "playback.timeline_total_exceeded": "timeline-invalid",
  "playback.realization_binding_limit": "realization-invalid",
  "playback.realization_binding_missing": "realization-invalid",
  "playback.realization_binding_extra": "realization-invalid",
  "playback.realization_binding_identity_mismatch": "realization-invalid",
  "playback.realization_source_chord_stale": "realization-invalid",
  "playback.realization_source_voicing_stale": "realization-invalid",
  "playback.realization_unavailable": "realization-invalid",
  "playback.generated_candidate_invalid": "realization-invalid",
  "playback.generated_candidate_realization_mismatch": "realization-invalid",
  "playback.generated_candidate_policy_mismatch": "realization-invalid",
  "playback.generated_candidate_voice_count_mismatch": "realization-invalid",
  "playback.generated_candidate_pitch_mismatch": "realization-invalid",
  "playback.stored_voicing_binding_mismatch": "realization-invalid",
  "playback.custom_voicing_missing": "realization-invalid",
  "playback.loop_invalid": "loop-invalid",
  "playback.loop_out_of_range": "loop-invalid",
  "playback.gate_not_midi_integral": "gate-invalid",
  "limit.playback_plan_work_exceeded": "work-limit-exceeded",
} as const);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finding(
  findings: P0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function requireExact(
  findings: P0ContractFinding[],
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    finding(findings, code, path, message);
  }
}

function pathString(path: readonly (string | number)[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((item) => `[${JSON.stringify(item)}]`).join("")}`;
}

/** Detect decoded duplicate keys before JSON.parse applies last-key-wins. */
function duplicateJsonKeys(source: string): readonly string[] {
  let cursor = 0;
  const duplicates: string[] = [];

  const whitespace = (): void => {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  };

  const stringToken = (): Readonly<{
    decoded: string;
    start: number;
  }> | null => {
    whitespace();
    if (source[cursor] !== '"') return null;
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const unit = source[cursor];
      if (unit === "\\") {
        cursor += 2;
        continue;
      }
      cursor += 1;
      if (unit === '"') {
        try {
          return {
            decoded: JSON.parse(source.slice(start, cursor)) as string,
            start,
          };
        } catch {
          return null;
        }
      }
    }
    return null;
  };

  const value = (path: readonly (string | number)[]): void => {
    whitespace();
    const unit = source[cursor];
    if (unit === "{") {
      cursor += 1;
      const seen = new Set<string>();
      whitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        const key = stringToken();
        if (key === null) return;
        if (seen.has(key.decoded)) {
          duplicates.push(
            `${pathString(path)}.${JSON.stringify(key.decoded)}@${String(key.start)}`,
          );
        }
        seen.add(key.decoded);
        whitespace();
        if (source[cursor] !== ":") return;
        cursor += 1;
        value([...path, key.decoded]);
        whitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === "[") {
      cursor += 1;
      let index = 0;
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        value([...path, index]);
        index += 1;
        whitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === '"') {
      stringToken();
      return;
    }
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  };

  value([]);
  return duplicates.sort(codeUnitCompare);
}

function requireObject(
  value: unknown,
  code: string,
  path: string,
  findings: P0ContractFinding[],
): JsonObject | null {
  if (!isObject(value)) {
    finding(findings, code, path, "Expected a JSON object.");
    return null;
  }
  return value;
}

function requireArray(
  value: unknown,
  code: string,
  path: string,
  findings: P0ContractFinding[],
): readonly unknown[] {
  if (!Array.isArray(value)) {
    finding(findings, code, path, "Expected a JSON array.");
    return [];
  }
  return value;
}

function stringArray(
  value: unknown,
  code: string,
  path: string,
  findings: P0ContractFinding[],
): readonly string[] {
  const values = requireArray(value, code, path, findings);
  const strings = values.filter((item): item is string => typeof item === "string");
  if (strings.length !== values.length) {
    finding(findings, code, path, "Expected only strings.");
  }
  return strings;
}

function uniqueSorted(
  values: readonly string[],
  code: string,
  path: string,
  findings: P0ContractFinding[],
): void {
  if (new Set(values).size !== values.length) {
    finding(findings, code, path, "Duplicate identifiers are forbidden.");
  }
  if (stableJson(values) !== stableJson([...values].sort(codeUnitCompare))) {
    finding(findings, code, path, "Identifiers must use code-unit order.");
  }
}

function recordArray(
  root: JsonObject,
  key: string,
  path: string,
  findings: P0ContractFinding[],
): readonly JsonObject[] {
  return requireArray(root[key], "P0_CONTRACT_ARRAY", `${path}:$.${key}`, findings)
    .map((value, index) =>
      requireObject(
        value,
        "P0_CONTRACT_RECORD",
        `${path}:$.${key}[${String(index)}]`,
        findings,
      ),
    )
    .filter((value): value is JsonObject => value !== null);
}

function recordsById(
  records: readonly JsonObject[],
  path: string,
  findings: P0ContractFinding[],
): ReadonlyMap<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (let index = 0; index < records.length; index += 1) {
    const id = records[index]?.["id"];
    if (typeof id !== "string" || id.length === 0) {
      finding(
        findings,
        "P0_CONTRACT_ID",
        `${path}[${String(index)}].id`,
        "Each record requires one nonempty string ID.",
      );
      continue;
    }
    if (result.has(id)) {
      finding(
        findings,
        "P0_CONTRACT_DUPLICATE_ID",
        `${path}[${String(index)}].id`,
        `Duplicate ID ${id}.`,
      );
    }
    result.set(id, records[index] ?? {});
  }
  return result;
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function readFixtures(
  fixtureRoot: string,
  findings: P0ContractFinding[],
): Promise<ReadonlyMap<P0FixtureFilename, ParsedFixture>> {
  let entries: string[];
  try {
    entries = (await readdir(fixtureRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort(codeUnitCompare);
  } catch (error) {
    finding(
      findings,
      "P0_CONTRACT_ROOT",
      fixtureRoot,
      `Could not read fixture root: ${String(error)}`,
    );
    return new Map();
  }

  requireExact(
    findings,
    entries,
    [...EXPECTED_FILES].sort(codeUnitCompare),
    "P0_CONTRACT_FILE_SET",
    fixtureRoot,
    "The playback-plan fixture directory must contain exactly the declared files.",
  );

  const parsed = new Map<P0FixtureFilename, ParsedFixture>();
  for (const filename of EXPECTED_FILES) {
    const path = resolve(fixtureRoot, filename);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch (error) {
      finding(
        findings,
        "P0_CONTRACT_FILE_READ",
        path,
        `Could not read fixture: ${String(error)}`,
      );
      continue;
    }

    const duplicates = duplicateJsonKeys(source);
    if (duplicates.length > 0) {
      finding(
        findings,
        "P0_CONTRACT_DUPLICATE_KEY",
        path,
        `Decoded duplicate JSON keys are forbidden: ${duplicates.join(", ")}.`,
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(source) as unknown;
    } catch (error) {
      finding(
        findings,
        "P0_CONTRACT_JSON",
        path,
        `Invalid JSON: ${String(error)}`,
      );
      continue;
    }
    const root = requireObject(
      value,
      "P0_CONTRACT_ROOT_SHAPE",
      path,
      findings,
    );
    if (root === null) continue;
    parsed.set(filename, {
      filename,
      path,
      source,
      root,
      byteDigest: sha256(source),
    });
  }
  return parsed;
}

function beatTicks(value: unknown): number | null {
  if (!isObject(value)) return null;
  const numerator = value["numerator"];
  const denominator = value["denominator"];
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    (numerator as number) < 0 ||
    (denominator as number) <= 0 ||
    MIDI_PPQ % (denominator as number) !== 0
  ) {
    return null;
  }
  const ticks =
    (numerator as number) * (MIDI_PPQ / (denominator as number));
  return Number.isSafeInteger(ticks) ? ticks : null;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function validateBeatValue(
  value: unknown,
  path: string,
  findings: P0ContractFinding[],
): number | null {
  const object = requireObject(
    value,
    "P0_CONTRACT_BEAT_SHAPE",
    path,
    findings,
  );
  if (object === null) return null;
  const numerator = object["numerator"];
  const denominator = object["denominator"];
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    (numerator as number) < 0 ||
    (denominator as number) <= 0
  ) {
    finding(
      findings,
      "P0_CONTRACT_BEAT_VALUE",
      path,
      "Beat values require nonnegative safe numerator and positive safe denominator.",
    );
    return null;
  }
  if (
    (numerator as number) !== 0 &&
    greatestCommonDivisor(numerator as number, denominator as number) !== 1
  ) {
    finding(
      findings,
      "P0_CONTRACT_BEAT_REDUCED",
      path,
      "Beat values must be canonical and reduced.",
    );
  }
  if ((numerator as number) === 0 && (denominator as number) !== 1) {
    finding(
      findings,
      "P0_CONTRACT_BEAT_ZERO",
      path,
      "Zero must use canonical denominator 1.",
    );
  }
  if (MIDI_PPQ % (denominator as number) !== 0) {
    finding(
      findings,
      "P0_CONTRACT_BEAT_PPQ",
      path,
      "Beat denominator must divide PPQ 960.",
    );
    return null;
  }
  return beatTicks(object);
}

function validateBeatTickPair(
  record: JsonObject,
  beatKey: string,
  tickKey: string,
  path: string,
  findings: P0ContractFinding[],
): void {
  if (!(beatKey in record) && !(tickKey in record)) return;
  if (record[beatKey] === null || record[tickKey] === null) {
    if (record[beatKey] !== null || record[tickKey] !== null) {
      finding(
        findings,
        "P0_CONTRACT_BEAT_TICK_NULL",
        path,
        `${beatKey} and ${tickKey} must both be null or both be present.`,
      );
    }
    return;
  }
  const expected = validateBeatValue(
    record[beatKey],
    `${path}.${beatKey}`,
    findings,
  );
  if (expected !== null && record[tickKey] !== expected) {
    finding(
      findings,
      "P0_CONTRACT_BEAT_TICK_MIRROR",
      `${path}.${tickKey}`,
      `Expected exact PPQ tick mirror ${String(expected)}.`,
    );
  }
}

const STEP_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function projectPitch(value: unknown): number | null {
  if (!isObject(value)) return null;
  const step = value["step"];
  const alter = value["alter"];
  const octave = value["octave"];
  if (
    typeof step !== "string" ||
    !(step in STEP_SEMITONES) ||
    !Number.isSafeInteger(alter) ||
    !Number.isSafeInteger(octave)
  ) {
    return null;
  }
  return (
    ((octave as number) + 1) * 12 +
    (STEP_SEMITONES[step] ?? 0) +
    (alter as number)
  );
}

function validateEmission(
  event: JsonObject,
  path: string,
  findings: P0ContractFinding[],
  requireFullEvent: boolean,
  expectedEventKeys: readonly string[],
): void {
  for (const [beatKey, tickKey] of [
    ["sourceStartBeat", "sourceStartTick"],
    ["sourceDurationBeats", "sourceDurationTicks"],
    ["sourceOffsetBeats", "sourceOffsetTicks"],
    ["startBeat", "startTick"],
    ["durationBeats", "durationTicks"],
    ["gateDurationBeats", "gateDurationTicks"],
  ] as const) {
    validateBeatTickPair(event, beatKey, tickKey, path, findings);
  }

  const durationTicks = event["durationTicks"];
  const gateTicks = event["gateDurationTicks"];
  if (Number.isSafeInteger(durationTicks) && Number.isSafeInteger(gateTicks)) {
    const expectedGate = Math.max(
      1,
      (durationTicks as number) - RELEASE_GAP_TICKS,
    );
    if (gateTicks !== expectedGate) {
      finding(
        findings,
        "P0_CONTRACT_GATE",
        `${path}.gateDurationTicks`,
        `Expected post-clip gate ${String(expectedGate)} ticks.`,
      );
    }
  }

  if (requireFullEvent) {
    requireExact(
      findings,
      Object.keys(event),
      expectedEventKeys,
      "P0_CONTRACT_EVENT_KEY_ORDER",
      path,
      "Expected event keys in the reviewed byte order.",
    );
    const pitches = requireArray(
      event["pitches"],
      "P0_CONTRACT_PITCH_ARRAY",
      `${path}.pitches`,
      findings,
    );
    const midiPitches = requireArray(
      event["midiPitches"],
      "P0_CONTRACT_MIDI_PITCH_ARRAY",
      `${path}.midiPitches`,
      findings,
    );
    if (pitches.length !== midiPitches.length || pitches.length === 0) {
      finding(
        findings,
        "P0_CONTRACT_PITCH_ALIGNMENT",
        path,
        "Spelled and MIDI pitch arrays must be nonempty and index-aligned.",
      );
    }
    for (let index = 0; index < Math.min(pitches.length, midiPitches.length); index += 1) {
      const projected = projectPitch(pitches[index]);
      if (projected === null || midiPitches[index] !== projected) {
        finding(
          findings,
          "P0_CONTRACT_PITCH_PROJECTION",
          `${path}.midiPitches[${String(index)}]`,
          "MIDI pitch must equal the exact spelling projection.",
        );
      }
    }
  }
}

function validateExpectedTiming(
  timelineRecords: readonly JsonObject[],
  loopRecords: readonly JsonObject[],
  eventKeyOrder: readonly string[],
  findings: P0ContractFinding[],
): void {
  for (let caseIndex = 0; caseIndex < timelineRecords.length; caseIndex += 1) {
    const record = timelineRecords[caseIndex] ?? {};
    if (!("expectedPlan" in record)) continue;
    const plan = requireObject(
      record["expectedPlan"],
      "P0_CONTRACT_EXPECTED_PLAN",
      `timeline-cases.json:$.cases[${String(caseIndex)}].expectedPlan`,
      findings,
    );
    if (plan === null) continue;
    validateBeatTickPair(
      plan,
      "totalBeats",
      "totalTicks",
      `timeline-cases.json:$.cases[${String(caseIndex)}].expectedPlan`,
      findings,
    );
    if ("events" in plan) {
      const events = recordArray(
        plan,
        "events",
        `timeline-cases.json:$.cases[${String(caseIndex)}].expectedPlan`,
        findings,
      );
      for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
        const event = events[eventIndex] ?? {};
        validateEmission(
          event,
          `timeline-cases.json:$.cases[${String(caseIndex)}].expectedPlan.events[${String(eventIndex)}]`,
          findings,
          true,
          eventKeyOrder,
        );
        if (event["ordinal"] !== eventIndex) {
          finding(
            findings,
            "P0_CONTRACT_EVENT_ORDINAL",
            `timeline-cases.json:$.cases[${String(caseIndex)}].expectedPlan.events[${String(eventIndex)}].ordinal`,
            "Emitted ordinals must be contiguous source-plan order.",
          );
        }
      }
    }
    if ("singleEvent" in plan) {
      const event = requireObject(
        plan["singleEvent"],
        "P0_CONTRACT_SINGLE_EVENT",
        `timeline-cases.json:$.cases[${String(caseIndex)}].expectedPlan.singleEvent`,
        findings,
      );
      if (event !== null) {
        const eventPath =
          `timeline-cases.json:$.cases[${String(caseIndex)}].expectedPlan.singleEvent`;
        for (const [beatKey, tickKey] of [
          ["startBeat", "startTick"],
          ["durationBeats", "durationTicks"],
          ["gateDurationBeats", "gateTicks"],
        ] as const) {
          if (beatKey in event && tickKey in event) {
            validateBeatTickPair(
              event,
              beatKey,
              tickKey,
              eventPath,
              findings,
            );
          }
        }
        const durationTicks = event["durationTicks"];
        const gateTicks = event["gateTicks"];
        if (
          Number.isSafeInteger(durationTicks) &&
          Number.isSafeInteger(gateTicks)
        ) {
          const expectedGate = Math.max(
            1,
            (durationTicks as number) - RELEASE_GAP_TICKS,
          );
          if (gateTicks !== expectedGate) {
            finding(
              findings,
              "P0_CONTRACT_GATE",
              `${eventPath}.gateTicks`,
              `Expected post-clip gate ${String(expectedGate)} ticks.`,
            );
          }
        }
      }
    }
  }

  const loopsById = recordsById(
    loopRecords,
    "loop-cases.json:$.cases",
    findings,
  );
  for (let caseIndex = 0; caseIndex < loopRecords.length; caseIndex += 1) {
    const record = loopRecords[caseIndex] ?? {};
    const loop = record["loop"];
    const expected = requireObject(
      record["expected"],
      "P0_CONTRACT_LOOP_EXPECTED",
      `loop-cases.json:$.cases[${String(caseIndex)}].expected`,
      findings,
    );
    if (expected === null || expected["ok"] !== true) continue;
    if (loop !== null) {
      const loopObject = requireObject(
        loop,
        "P0_CONTRACT_LOOP",
        `loop-cases.json:$.cases[${String(caseIndex)}].loop`,
        findings,
      );
      const tickRange = requireObject(
        expected["loopTicks"],
        "P0_CONTRACT_LOOP_TICKS",
        `loop-cases.json:$.cases[${String(caseIndex)}].expected.loopTicks`,
        findings,
      );
      if (loopObject !== null && tickRange !== null) {
        const startTicks = validateBeatValue(
          loopObject["start"],
          `loop-cases.json:$.cases[${String(caseIndex)}].loop.start`,
          findings,
        );
        const endTicks = validateBeatValue(
          loopObject["end"],
          `loop-cases.json:$.cases[${String(caseIndex)}].loop.end`,
          findings,
        );
        if (
          startTicks !== null &&
          endTicks !== null &&
          (tickRange["start"] !== startTicks || tickRange["end"] !== endTicks)
        ) {
          finding(
            findings,
            "P0_CONTRACT_LOOP_TICK_MIRROR",
            `loop-cases.json:$.cases[${String(caseIndex)}].expected.loopTicks`,
            "Loop tick range must mirror the exact beat range.",
          );
        }
      }
    }
    if ("emissions" in expected) {
      const emissions = recordArray(
        expected,
        "emissions",
        `loop-cases.json:$.cases[${String(caseIndex)}].expected`,
        findings,
      );
      for (let eventIndex = 0; eventIndex < emissions.length; eventIndex += 1) {
        validateEmission(
          emissions[eventIndex] ?? {},
          `loop-cases.json:$.cases[${String(caseIndex)}].expected.emissions[${String(eventIndex)}]`,
          findings,
          false,
          eventKeyOrder,
        );
      }
    } else {
      const emissionRef = expected["emissionRef"];
      const referenced = typeof emissionRef === "string"
        ? loopsById.get(emissionRef)
        : undefined;
      const referencedExpected = referenced === undefined
        ? null
        : requireObject(
            referenced["expected"],
            "P0_CONTRACT_LOOP_EXPECTED",
            `loop-cases.json:${String(emissionRef)}.expected`,
            findings,
          );
      if (
        referencedExpected === null ||
        !Array.isArray(referencedExpected["emissions"])
      ) {
        finding(
          findings,
          "P0_CONTRACT_EMISSION_REF",
          `loop-cases.json:$.cases[${String(caseIndex)}].expected.emissionRef`,
          "A compact emission reference must resolve to a case with explicit emissions.",
        );
      }
    }
  }
}

function validateExpectedOutcome(
  expected: unknown,
  path: string,
  findings: P0ContractFinding[],
): void {
  const record = requireObject(
    expected,
    "P0_CONTRACT_EXPECTED_OUTCOME",
    path,
    findings,
  );
  if (record === null) return;

  if (record["ok"] === true && "termination" in record) {
    requireExact(
      findings,
      record["termination"],
      "complete",
      "P0_CONTRACT_SUCCESS_TERMINATION",
      `${path}.termination`,
      "A successful expectation can only terminate as complete.",
    );
    return;
  }
  if (record["ok"] !== false && !("code" in record)) return;

  const code = record["code"];
  const expectedTermination =
    typeof code === "string"
      ? EXPECTED_TERMINATION_BY_REFUSAL[
          code as keyof typeof EXPECTED_TERMINATION_BY_REFUSAL
        ]
      : undefined;
  if (expectedTermination === undefined) {
    finding(
      findings,
      "P0_CONTRACT_REFUSAL_CODE",
      `${path}.code`,
      `Unknown playback-plan refusal code ${String(code)}.`,
    );
    return;
  }
  requireExact(
    findings,
    record["termination"],
    expectedTermination,
    "P0_CONTRACT_REFUSAL_TERMINATION",
    `${path}.termination`,
    `Refusal ${String(code)} must terminate as ${expectedTermination}.`,
  );
  if ("partialResult" in record) {
    requireExact(
      findings,
      record["partialResult"],
      false,
      "P0_CONTRACT_PARTIAL_RESULT",
      `${path}.partialResult`,
      "A refusal may never claim a partial playback plan.",
    );
  }
}

function validateTempoRelation(
  timelineRecords: readonly JsonObject[],
  findings: P0ContractFinding[],
): void {
  const relationCase = timelineRecords.find(
    (record) => record["id"] === "P0-TIME-010",
  );
  if (relationCase === undefined) {
    finding(
      findings,
      "P0_CONTRACT_TEMPO_RELATION",
      "timeline-cases.json",
      "The reviewed tempo-invariance relation case is missing.",
    );
    return;
  }
  const recipes = recordArray(
    relationCase,
    "pairedDocumentRecipes",
    "timeline-cases.json:P0-TIME-010",
    findings,
  );
  requireExact(
    findings,
    recipes.length,
    2,
    "P0_CONTRACT_TEMPO_RELATION",
    "timeline-cases.json:P0-TIME-010.pairedDocumentRecipes",
    "Tempo invariance requires exactly two otherwise-equivalent recipes.",
  );
  if (recipes.length === 2) {
    const normalized = recipes.map((recipe) =>
      Object.fromEntries(
        Object.entries(recipe).filter(
          ([key]) => key !== "documentId" && key !== "tempoBpm",
        ),
      ),
    );
    requireExact(
      findings,
      normalized[0],
      normalized[1],
      "P0_CONTRACT_TEMPO_RELATION",
      "timeline-cases.json:P0-TIME-010.pairedDocumentRecipes",
      "The tempo pair may differ only in document identity and BPM.",
    );
    requireExact(
      findings,
      recipes.map((recipe) => recipe["tempoBpm"]),
      [20, 400],
      "P0_CONTRACT_TEMPO_RELATION",
      "timeline-cases.json:P0-TIME-010.pairedDocumentRecipes",
      "The reviewed tempo pair must cover both document BPM boundaries.",
    );
    const documentIds = recipes.map((recipe) => recipe["documentId"]);
    if (
      documentIds.some((id) => typeof id !== "string") ||
      new Set(documentIds).size !== 2
    ) {
      finding(
        findings,
        "P0_CONTRACT_TEMPO_RELATION",
        "timeline-cases.json:P0-TIME-010.pairedDocumentRecipes",
        "The tempo pair requires two distinct string document identities.",
      );
    }
  }
  const relation = requireObject(
    relationCase["expectedRelation"],
    "P0_CONTRACT_TEMPO_RELATION",
    "timeline-cases.json:P0-TIME-010.expectedRelation",
    findings,
  );
  if (relation === null) return;
  requireExact(
    findings,
    relation,
    {
      differentFields: ["sourceDocumentId", "tempoBpm"],
      equalFields: [
        "schema",
        "compilerId",
        "compilerVersion",
        "articulationPolicyId",
        "articulationPolicyVersion",
        "loopPolicyId",
        "loopPolicyVersion",
        "velocityPolicyId",
        "velocityPolicyVersion",
        "realizationBindingPolicyId",
        "realizationBindingPolicyVersion",
        "midiPpq",
        "meter",
        "events",
        "totalBeats",
        "totalTicks",
        "loop",
        "loopTicks",
      ],
      forbiddenPlanFields: [
        "seconds",
        "startSeconds",
        "durationSeconds",
        "gateSeconds",
      ],
    },
    "P0_CONTRACT_TEMPO_RELATION",
    "timeline-cases.json:P0-TIME-010.expectedRelation",
    "Tempo invariance must exclude seconds and preserve every other plan field.",
  );
}

function validateReferences(
  records: readonly JsonObject[],
  path: string,
  traceIds: ReadonlySet<string>,
  authorityIds: ReadonlySet<string>,
  findings: P0ContractFinding[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? {};
    const traces = stringArray(
      record["traceIds"],
      "P0_CONTRACT_TRACE_LINK",
      `${path}[${String(index)}].traceIds`,
      findings,
    );
    const authorities = stringArray(
      record["authorityIds"],
      "P0_CONTRACT_AUTHORITY_LINK",
      `${path}[${String(index)}].authorityIds`,
      findings,
    );
    if (traces.length === 0 || authorities.length === 0) {
      finding(
        findings,
        "P0_CONTRACT_LINK_EMPTY",
        `${path}[${String(index)}]`,
        "Reviewed source/case records require trace and authority links.",
      );
    }
    for (const trace of traces) {
      if (!traceIds.has(trace)) {
        finding(
          findings,
          "P0_CONTRACT_TRACE_UNKNOWN",
          `${path}[${String(index)}].traceIds`,
          `Unknown trace ${trace}.`,
        );
      }
    }
    for (const authority of authorities) {
      if (!authorityIds.has(authority)) {
        finding(
          findings,
          "P0_CONTRACT_AUTHORITY_UNKNOWN",
          `${path}[${String(index)}].authorityIds`,
          `Unknown authority ${authority}.`,
        );
      }
    }
  }
}

function findSourceRefs(
  value: unknown,
  path: string,
  sourceIds: ReadonlySet<string>,
  findings: P0ContractFinding[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      findSourceRefs(
        child,
        `${path}[${String(index)}]`,
        sourceIds,
        findings,
      );
    });
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (
      key === "sourceRef" &&
      typeof child === "string" &&
      !child.startsWith("independent-inline:") &&
      !sourceIds.has(child)
    ) {
      finding(
        findings,
        "P0_CONTRACT_SOURCE_REF",
        childPath,
        `Unknown source catalog reference ${child}.`,
      );
    }
    findSourceRefs(child, childPath, sourceIds, findings);
  }
}

function validateDeclaredTraceBacklinks(
  records: readonly JsonObject[],
  linkedField: "authorityIds" | "caseIds" | "mutationControlIds",
  traceMap: ReadonlyMap<string, JsonObject>,
  path: string,
  findings: P0ContractFinding[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? {};
    const id = record["id"];
    if (typeof id !== "string" || !Array.isArray(record["traceIds"])) continue;
    for (const traceId of stringArray(
      record["traceIds"],
      "P0_CONTRACT_BACKLINK_TRACE_IDS",
      `${path}[${String(index)}].traceIds`,
      findings,
    )) {
      const trace = traceMap.get(traceId);
      const linkedIds =
        trace === undefined || !Array.isArray(trace[linkedField])
          ? []
          : trace[linkedField];
      if (!linkedIds.includes(id)) {
        finding(
          findings,
          "P0_CONTRACT_TRACE_BACKLINK",
          `${path}[${String(index)}].traceIds`,
          `${traceId} must backlink ${id} through ${linkedField}.`,
        );
      }
    }
  }
}

function findingOrder(
  left: P0ContractFinding,
  right: P0ContractFinding,
): number {
  return (
    codeUnitCompare(left.path, right.path) ||
    codeUnitCompare(left.code, right.code) ||
    codeUnitCompare(left.message, right.message)
  );
}

export async function validateP0Contract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
): Promise<P0ContractValidationReport> {
  const findings: P0ContractFinding[] = [];
  const fixtures = await readFixtures(fixtureRoot, findings);

  for (const filename of EXPECTED_FILES) {
    const fixture = fixtures.get(filename);
    if (fixture === undefined) continue;
    requireExact(
      findings,
      fixture.byteDigest,
      P0_REVIEWED_BYTE_DIGESTS[filename],
      "P0_CONTRACT_BYTE_DIGEST",
      fixture.path,
      "Fixture bytes differ from the reviewed digest.",
    );
    requireExact(
      findings,
      fixture.root["schema"],
      EXPECTED_SCHEMAS[filename],
      "P0_CONTRACT_SCHEMA",
      `${fixture.path}:$.schema`,
      "Fixture schema identity drifted.",
    );
    requireExact(
      findings,
      Object.keys(fixture.root).sort(codeUnitCompare),
      [...EXPECTED_TOP_LEVEL_KEYS[filename]].sort(codeUnitCompare),
      "P0_CONTRACT_TOP_LEVEL_KEYS",
      fixture.path,
      "Fixture top-level key set drifted.",
    );
    requireExact(
      findings,
      fixture.root["fixtureVersion"],
      EXPECTED_FIXTURE_VERSION,
      "P0_CONTRACT_FIXTURE_VERSION",
      `${fixture.path}:$.fixtureVersion`,
      "Fixture version must remain reviewed version 1.0.0.",
    );
    requireExact(
      findings,
      fixture.root["status"],
      EXPECTED_STATUS,
      "P0_CONTRACT_STATUS",
      `${fixture.path}:$.status`,
      "Fixture must remain explicitly pre-production and independently authored.",
    );
    requireExact(
      findings,
      fixture.root["expectedValuesGenerated"],
      false,
      "P0_CONTRACT_SELF_CERTIFICATION",
      `${fixture.path}:$.expectedValuesGenerated`,
      "Expected values may not be generated.",
    );
    requireExact(
      findings,
      fixture.root["productionOutputUsed"],
      false,
      "P0_CONTRACT_SELF_CERTIFICATION",
      `${fixture.path}:$.productionOutputUsed`,
      "Production output may not author fixture expectations.",
    );
  }

  const contract = fixtures.get(CONTRACT_FILENAME)?.root ?? {};
  const sourceRoot = fixtures.get("source-catalog.json")?.root ?? {};
  const timelineRoot = fixtures.get("timeline-cases.json")?.root ?? {};
  const realizationRoot = fixtures.get("realization-cases.json")?.root ?? {};
  const loopRoot = fixtures.get("loop-cases.json")?.root ?? {};
  const lawRoot = fixtures.get("law-cases.json")?.root ?? {};
  const limitRoot = fixtures.get("limit-cases.json")?.root ?? {};
  const mutationRoot = fixtures.get("mutation-controls.json")?.root ?? {};
  const provenanceRoot = fixtures.get("provenance-ledger.json")?.root ?? {};
  const traceRoot = fixtures.get("trace-ledger.json")?.root ?? {};

  requireExact(
    findings,
    contract["declaredFiles"],
    EXPECTED_FILES,
    "P0_CONTRACT_DECLARED_FILES",
    `${CONTRACT_FILENAME}:$.declaredFiles`,
    "Declared file inventory must equal the actual reviewed file set.",
  );

  const reviewedHashes = requireObject(
    contract["reviewedFileSha256"],
    "P0_CONTRACT_REVIEWED_HASHES",
    `${CONTRACT_FILENAME}:$.reviewedFileSha256`,
    findings,
  );
  if (reviewedHashes !== null) {
    requireExact(
      findings,
      Object.keys(reviewedHashes).sort(codeUnitCompare),
      [...P0_REVIEWED_COMPANIONS].sort(codeUnitCompare),
      "P0_CONTRACT_REVIEWED_HASH_INVENTORY",
      `${CONTRACT_FILENAME}:$.reviewedFileSha256`,
      "Contract must pin every companion and only companions.",
    );
    for (const filename of P0_REVIEWED_COMPANIONS) {
      requireExact(
        findings,
        reviewedHashes[filename],
        P0_REVIEWED_BYTE_DIGESTS[filename],
        "P0_CONTRACT_REVIEWED_HASH",
        `${CONTRACT_FILENAME}:$.reviewedFileSha256.${filename}`,
        "Companion digest differs from the reviewed bytes.",
      );
    }
  }

  const contractTraceIds = stringArray(
    contract["traceIds"],
    "P0_CONTRACT_TRACE_IDS",
    `${CONTRACT_FILENAME}:$.traceIds`,
    findings,
  );
  const contractAuthorityIds = stringArray(
    contract["authorityIds"],
    "P0_CONTRACT_AUTHORITY_IDS",
    `${CONTRACT_FILENAME}:$.authorityIds`,
    findings,
  );
  uniqueSorted(
    contractTraceIds,
    "P0_CONTRACT_TRACE_IDS",
    `${CONTRACT_FILENAME}:$.traceIds`,
    findings,
  );
  uniqueSorted(
    contractAuthorityIds,
    "P0_CONTRACT_AUTHORITY_IDS",
    `${CONTRACT_FILENAME}:$.authorityIds`,
    findings,
  );
  requireExact(
    findings,
    contractTraceIds,
    P0_REVIEWED_TRACE_IDS,
    "P0_CONTRACT_TRACE_IDS",
    `${CONTRACT_FILENAME}:$.traceIds`,
    "Trace inventory drifted.",
  );
  requireExact(
    findings,
    contractAuthorityIds,
    P0_REVIEWED_AUTHORITY_IDS,
    "P0_CONTRACT_AUTHORITY_IDS",
    `${CONTRACT_FILENAME}:$.authorityIds`,
    "Authority inventory drifted.",
  );

  const sources = recordArray(
    sourceRoot,
    "sources",
    "source-catalog.json",
    findings,
  );
  const timelineCases = recordArray(
    timelineRoot,
    "cases",
    "timeline-cases.json",
    findings,
  );
  const realizationCases = recordArray(
    realizationRoot,
    "cases",
    "realization-cases.json",
    findings,
  );
  const loopCases = recordArray(loopRoot, "cases", "loop-cases.json", findings);
  const lawCases = recordArray(lawRoot, "cases", "law-cases.json", findings);
  const structuralLimitCases = recordArray(
    limitRoot,
    "structuralCases",
    "limit-cases.json",
    findings,
  );
  const counterBoundaryCases = recordArray(
    limitRoot,
    "counterBoundaries",
    "limit-cases.json",
    findings,
  );
  const mutationControls = recordArray(
    mutationRoot,
    "controls",
    "mutation-controls.json",
    findings,
  );
  const authorities = recordArray(
    provenanceRoot,
    "authorities",
    "provenance-ledger.json",
    findings,
  );
  const traces = recordArray(traceRoot, "traces", "trace-ledger.json", findings);
  const parentClaims = recordArray(
    traceRoot,
    "parentClaims",
    "trace-ledger.json",
    findings,
  );

  const sourceMap = recordsById(sources, "source-catalog.json:$.sources", findings);
  const caseRecords = [
    ...timelineCases,
    ...realizationCases,
    ...loopCases,
    ...lawCases,
    ...structuralLimitCases,
    ...counterBoundaryCases,
  ];
  const caseMap = recordsById(caseRecords, "P0 named cases", findings);
  const mutationMap = recordsById(
    mutationControls,
    "mutation-controls.json:$.controls",
    findings,
  );
  const authorityMap = recordsById(
    authorities,
    "provenance-ledger.json:$.authorities",
    findings,
  );
  const traceMap = recordsById(traces, "trace-ledger.json:$.traces", findings);
  const parentClaimMap = recordsById(
    parentClaims,
    "trace-ledger.json:$.parentClaims",
    findings,
  );

  validateTempoRelation(timelineCases, findings);
  for (let index = 0; index < realizationCases.length; index += 1) {
    validateExpectedOutcome(
      realizationCases[index]?.["expected"],
      `realization-cases.json:$.cases[${String(index)}].expected`,
      findings,
    );
  }
  for (let index = 0; index < loopCases.length; index += 1) {
    validateExpectedOutcome(
      loopCases[index]?.["expected"],
      `loop-cases.json:$.cases[${String(index)}].expected`,
      findings,
    );
  }
  for (let index = 0; index < structuralLimitCases.length; index += 1) {
    validateExpectedOutcome(
      structuralLimitCases[index]?.["expected"],
      `limit-cases.json:$.structuralCases[${String(index)}].expected`,
      findings,
    );
  }
  for (let index = 0; index < counterBoundaryCases.length; index += 1) {
    validateExpectedOutcome(
      counterBoundaryCases[index]?.["plusOne"],
      `limit-cases.json:$.counterBoundaries[${String(index)}].plusOne`,
      findings,
    );
  }

  requireExact(
    findings,
    [...authorityMap.keys()].sort(codeUnitCompare),
    P0_REVIEWED_AUTHORITY_IDS,
    "P0_CONTRACT_AUTHORITY_LEDGER",
    "provenance-ledger.json:$.authorities",
    "Authority ledger must exactly own the declared authority IDs.",
  );
  requireExact(
    findings,
    [...traceMap.keys()].sort(codeUnitCompare),
    P0_REVIEWED_TRACE_IDS,
    "P0_CONTRACT_TRACE_LEDGER",
    "trace-ledger.json:$.traces",
    "Trace ledger must exactly own the declared trace IDs.",
  );

  const traceIdSet = new Set(contractTraceIds);
  const authorityIdSet = new Set(contractAuthorityIds);
  validateReferences(
    sources,
    "source-catalog.json:$.sources",
    traceIdSet,
    authorityIdSet,
    findings,
  );
  validateReferences(
    timelineCases,
    "timeline-cases.json:$.cases",
    traceIdSet,
    authorityIdSet,
    findings,
  );
  validateReferences(
    realizationCases,
    "realization-cases.json:$.cases",
    traceIdSet,
    authorityIdSet,
    findings,
  );
  validateReferences(
    loopCases,
    "loop-cases.json:$.cases",
    traceIdSet,
    authorityIdSet,
    findings,
  );
  validateReferences(
    lawCases,
    "law-cases.json:$.cases",
    traceIdSet,
    authorityIdSet,
    findings,
  );
  validateReferences(
    structuralLimitCases,
    "limit-cases.json:$.structuralCases",
    traceIdSet,
    authorityIdSet,
    findings,
  );

  const limitTraceIds = stringArray(
    limitRoot["traceIds"],
    "P0_CONTRACT_TRACE_LINK",
    "limit-cases.json:$.traceIds",
    findings,
  );
  const limitAuthorityIds = stringArray(
    limitRoot["authorityIds"],
    "P0_CONTRACT_AUTHORITY_LINK",
    "limit-cases.json:$.authorityIds",
    findings,
  );
  for (const id of limitTraceIds) {
    if (!traceIdSet.has(id)) {
      finding(
        findings,
        "P0_CONTRACT_TRACE_UNKNOWN",
        "limit-cases.json:$.traceIds",
        `Unknown trace ${id}.`,
      );
    }
  }
  for (const id of limitAuthorityIds) {
    if (!authorityIdSet.has(id)) {
      finding(
        findings,
        "P0_CONTRACT_AUTHORITY_UNKNOWN",
        "limit-cases.json:$.authorityIds",
        `Unknown authority ${id}.`,
      );
    }
  }

  const caseIdsReferencedByTraces = new Set<string>();
  const mutationsReferencedByTraces = new Set<string>();
  const parentClaimsReferencedByTraces = new Set<string>();
  const authoritiesReferencedByTraces = new Set<string>();
  for (let index = 0; index < traces.length; index += 1) {
    const trace = traces[index] ?? {};
    for (const caseId of stringArray(
      trace["caseIds"],
      "P0_CONTRACT_TRACE_CASES",
      `trace-ledger.json:$.traces[${String(index)}].caseIds`,
      findings,
    )) {
      caseIdsReferencedByTraces.add(caseId);
      if (!caseMap.has(caseId)) {
        finding(
          findings,
          "P0_CONTRACT_TRACE_CASE_UNKNOWN",
          `trace-ledger.json:$.traces[${String(index)}].caseIds`,
          `Unknown case ${caseId}.`,
        );
      }
    }
    for (const mutationId of stringArray(
      trace["mutationControlIds"],
      "P0_CONTRACT_TRACE_MUTATIONS",
      `trace-ledger.json:$.traces[${String(index)}].mutationControlIds`,
      findings,
    )) {
      mutationsReferencedByTraces.add(mutationId);
      if (!mutationMap.has(mutationId)) {
        finding(
          findings,
          "P0_CONTRACT_TRACE_MUTATION_UNKNOWN",
          `trace-ledger.json:$.traces[${String(index)}].mutationControlIds`,
          `Unknown mutation control ${mutationId}.`,
        );
      }
    }
    for (const authorityId of stringArray(
      trace["authorityIds"],
      "P0_CONTRACT_TRACE_AUTHORITIES",
      `trace-ledger.json:$.traces[${String(index)}].authorityIds`,
      findings,
    )) {
      authoritiesReferencedByTraces.add(authorityId);
      if (!authorityMap.has(authorityId)) {
        finding(
          findings,
          "P0_CONTRACT_TRACE_AUTHORITY_UNKNOWN",
          `trace-ledger.json:$.traces[${String(index)}].authorityIds`,
          `Unknown authority ${authorityId}.`,
        );
      }
    }
    for (const parentClaimId of stringArray(
      trace["parentClaimIds"],
      "P0_CONTRACT_TRACE_PARENT",
      `trace-ledger.json:$.traces[${String(index)}].parentClaimIds`,
      findings,
    )) {
      parentClaimsReferencedByTraces.add(parentClaimId);
      if (!parentClaimMap.has(parentClaimId)) {
        finding(
          findings,
          "P0_CONTRACT_TRACE_PARENT_UNKNOWN",
          `trace-ledger.json:$.traces[${String(index)}].parentClaimIds`,
          `Unknown parent claim ${parentClaimId}.`,
        );
      }
    }
  }

  for (const caseId of caseMap.keys()) {
    if (!caseIdsReferencedByTraces.has(caseId)) {
      finding(
        findings,
        "P0_CONTRACT_CASE_UNTRACED",
        caseId,
        "Every named case must appear in at least one trace.",
      );
    }
  }
  for (const parentClaimId of parentClaimMap.keys()) {
    if (!parentClaimsReferencedByTraces.has(parentClaimId)) {
      finding(
        findings,
        "P0_CONTRACT_PARENT_UNTRACED",
        parentClaimId,
        "Every parent claim must appear in at least one trace.",
      );
    }
  }
  for (const authorityId of authorityMap.keys()) {
    if (!authoritiesReferencedByTraces.has(authorityId)) {
      finding(
        findings,
        "P0_CONTRACT_AUTHORITY_UNTRACED",
        authorityId,
        "Every authority must appear in at least one trace.",
      );
    }
  }

  const tracePolicy = requireObject(
    traceRoot["tracePolicy"],
    "P0_CONTRACT_TRACE_POLICY",
    "trace-ledger.json:$.tracePolicy",
    findings,
  );
  if (tracePolicy !== null) {
    for (const key of [
      "allParentClausesLinked",
      "allCasesBacklinked",
      "allMutationControlsBacklinked",
      "allAuthoritiesBacklinked",
    ] as const) {
      requireExact(
        findings,
        tracePolicy[key],
        true,
        "P0_CONTRACT_TRACE_POLICY",
        `trace-ledger.json:$.tracePolicy.${key}`,
        `${key} must remain an explicit reviewed requirement.`,
      );
    }
  }
  validateDeclaredTraceBacklinks(
    caseRecords,
    "caseIds",
    traceMap,
    "P0 named cases",
    findings,
  );
  validateDeclaredTraceBacklinks(
    mutationControls,
    "mutationControlIds",
    traceMap,
    "mutation-controls.json:$.controls",
    findings,
  );
  validateDeclaredTraceBacklinks(
    authorities,
    "authorityIds",
    traceMap,
    "provenance-ledger.json:$.authorities",
    findings,
  );

  for (let index = 0; index < mutationControls.length; index += 1) {
    const control = mutationControls[index] ?? {};
    const killerCaseIds = stringArray(
      control["killerCaseIds"],
      "P0_CONTRACT_MUTATION_KILLERS",
      `mutation-controls.json:$.controls[${String(index)}].killerCaseIds`,
      findings,
    );
    if (killerCaseIds.length === 0) {
      finding(
        findings,
        "P0_CONTRACT_MUTATION_KILLERS",
        `mutation-controls.json:$.controls[${String(index)}].killerCaseIds`,
        "Every mutation requires at least one named killer case.",
      );
    }
    for (const caseId of killerCaseIds) {
      if (!caseMap.has(caseId)) {
        finding(
          findings,
          "P0_CONTRACT_MUTATION_KILLER_UNKNOWN",
          `mutation-controls.json:$.controls[${String(index)}].killerCaseIds`,
          `Unknown killer case ${caseId}.`,
        );
      }
    }
    for (const traceId of stringArray(
      control["traceIds"],
      "P0_CONTRACT_MUTATION_TRACES",
      `mutation-controls.json:$.controls[${String(index)}].traceIds`,
      findings,
    )) {
      if (!traceMap.has(traceId)) {
        finding(
          findings,
          "P0_CONTRACT_MUTATION_TRACE_UNKNOWN",
          `mutation-controls.json:$.controls[${String(index)}].traceIds`,
          `Unknown trace ${traceId}.`,
        );
      }
    }
    for (const authorityId of stringArray(
      control["authorityIds"],
      "P0_CONTRACT_MUTATION_AUTHORITIES",
      `mutation-controls.json:$.controls[${String(index)}].authorityIds`,
      findings,
    )) {
      if (!authorityMap.has(authorityId)) {
        finding(
          findings,
          "P0_CONTRACT_MUTATION_AUTHORITY_UNKNOWN",
          `mutation-controls.json:$.controls[${String(index)}].authorityIds`,
          `Unknown authority ${authorityId}.`,
        );
      }
    }
  }
  for (const mutationId of mutationMap.keys()) {
    if (!mutationsReferencedByTraces.has(mutationId)) {
      finding(
        findings,
        "P0_CONTRACT_MUTATION_UNTRACED",
        mutationId,
        "Every mutation control must appear in at least one trace.",
      );
    }
  }

  findSourceRefs(
    [
      timelineRoot,
      realizationRoot,
      loopRoot,
      lawRoot,
      limitRoot,
    ],
    "playback-plan fixtures",
    new Set(sourceMap.keys()),
    findings,
  );

  const outputPolicy = requireObject(
    contract["outputPolicy"],
    "P0_CONTRACT_OUTPUT_POLICY",
    `${CONTRACT_FILENAME}:$.outputPolicy`,
    findings,
  );
  const eventKeyOrder =
    outputPolicy === null
      ? []
      : stringArray(
          outputPolicy["eventOwnKeyOrder"],
          "P0_CONTRACT_EVENT_KEY_ORDER",
          `${CONTRACT_FILENAME}:$.outputPolicy.eventOwnKeyOrder`,
          findings,
        );
  validateExpectedTiming(
    timelineCases,
    loopCases,
    eventKeyOrder,
    findings,
  );

  const coverage = requireObject(
    contract["coverageSummary"],
    "P0_CONTRACT_COVERAGE",
    `${CONTRACT_FILENAME}:$.coverageSummary`,
    findings,
  );
  const counts = {
    files: fixtures.size,
    sources: sources.length,
    timelineCases: timelineCases.length,
    realizationCases: realizationCases.length,
    loopCases: loopCases.length,
    lawCases: lawCases.length,
    structuralLimitCases: structuralLimitCases.length,
    counterBoundaryCases: counterBoundaryCases.length,
    totalNamedCases: caseMap.size,
    mutationControls: mutationControls.length,
    authorities: authorities.length,
    traces: traces.length,
  } as const;
  requireExact(
    findings,
    counts,
    P0_EXPECTED_COUNTS,
    "P0_CONTRACT_COUNTS",
    fixtureRoot,
    "Reviewed fixture counts drifted.",
  );
  if (coverage !== null) {
    requireExact(
      findings,
      {
        sourceRecords: coverage["sourceRecords"],
        timelineCases: coverage["timelineCases"],
        realizationCases: coverage["realizationCases"],
        loopCases: coverage["loopCases"],
        lawCases: coverage["lawCases"],
        structuralLimitCases: coverage["structuralLimitCases"],
        counterBoundaryCases: coverage["counterBoundaryCases"],
        totalNamedCases: coverage["totalNamedCases"],
        mutationControls: coverage["mutationControls"],
        authorities: coverage["authorities"],
        traces: coverage["traces"],
      },
      {
        sourceRecords: counts.sources,
        timelineCases: counts.timelineCases,
        realizationCases: counts.realizationCases,
        loopCases: counts.loopCases,
        lawCases: counts.lawCases,
        structuralLimitCases: counts.structuralLimitCases,
        counterBoundaryCases: counts.counterBoundaryCases,
        totalNamedCases: counts.totalNamedCases,
        mutationControls: counts.mutationControls,
        authorities: counts.authorities,
        traces: counts.traces,
      },
      "P0_CONTRACT_COVERAGE",
      `${CONTRACT_FILENAME}:$.coverageSummary`,
      "Coverage summary must equal the independently counted records.",
    );
  }

  requireExact(
    findings,
    mutationRoot["humanReviewClaimed"],
    false,
    "P0_CONTRACT_HUMAN_CLAIM",
    "mutation-controls.json:$.humanReviewClaimed",
    "Pre-production mutation authority may not claim completed human review.",
  );

  findings.sort(findingOrder);
  return {
    schema: "changes.validation.p0-contract.v1",
    package: "P0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts,
    findings,
  };
}

if (import.meta.main) {
  const report = await validateP0Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
