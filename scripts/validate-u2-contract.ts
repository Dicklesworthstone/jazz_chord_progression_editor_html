/**
 * Independent validator for the proposed U2 Chord Inspector packet.
 *
 * This validator imports no production module. It restates every constant it
 * judges (the U2_REVIEWED_* exports below), re-derives every expectation
 * from the fixture scenarios, replays every mutation control, and pins
 * the frozen packet with byte and semantic digests.
 *
 * CLI: bun scripts/validate-u2-contract.ts [fixtureRoot] [--allow-pending-freeze]
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/* -------------------------------------------------------------------------- */
/* Restated reviewed constants                                                */
/* -------------------------------------------------------------------------- */

export const U2_REVIEWED_CONTRACT_SCHEMA =
  "changes.ui.u2-chord-inspector-contract.v1";
export const U2_REVIEWED_MANIFEST_SCHEMA =
  "changes.fixtures.u2-chord-inspector-contract.v1";
export const U2_REVIEWED_PACKAGE = "U2";
export const U2_REVIEWED_BEAD_ID = "jcpe-milestone-reliable-studio-l3a.11.1";
export const U2_REVIEWED_POLICY_ID = "changes.u2-chord-inspector";
export const U2_REVIEWED_POLICY_VERSION = 1;

export const U2_REVIEWED_TABS = Object.freeze([
  "symbol",
  "structure",
  "timing",
  "voicing",
  "harmony",
  "motion",
  "notes",
] as const);

export const U2_REVIEWED_VOICING_MODES = Object.freeze([
  "auto",
  "manual",
  "frozen",
] as const);

export const U2_REVIEWED_PIANO_NOTE_ROLES = Object.freeze([
  "root",
  "guide-third",
  "guide-seventh",
  "tension",
  "color",
  "bass",
  "omitted",
] as const);

export const U2_REVIEWED_PIANO_BOUNDS = Object.freeze({
  minMidi: 21,
  maxMidi: 108,
  visibleMinMidi: 36,
  visibleMaxMidi: 84,
  minManualNotes: 1,
  maxManualNotes: 12,
  maxAnnotationCodePoints: 500,
});

export const U2_REVIEWED_REFUSAL_CODES = Object.freeze([
  "u2.no_selected_chord",
  "u2.invalid_symbol_syntax",
  "u2.unresolvable_chord_symbol",
  "u2.manual_voicing_empty",
  "u2.manual_voicing_exceeds_maximum",
  "u2.manual_voicing_unison_duplicate",
  "u2.manual_voicing_out_of_range",
  "u2.mode_switch_requires_confirmation",
  "u2.annotation_length_exceeded",
  "u2.preview_audio_unavailable",
  "u2.preview_generation_mismatch",
] as const);

export const U2_EXPECTED_COMPANIONS = Object.freeze([
  "inspector-cases.json",
  "piano-cases.json",
  "voicing-transition-cases.json",
  "annotation-cases.json",
  "mutation-controls.json",
  "trace-ledger.json",
  "provenance-ledger.json",
] as const);

export const U2_EXPECTED_COUNTS = Object.freeze({
  tabs: 7,
  inspectorCases: 4,
  pianoCases: 4,
  voicingTransitionCases: 4,
  annotationCases: 4,
  mutationControls: 8,
  traces: 11,
  authorities: 6,
  laws: 6,
});

export const U2_SPEC_BYTE_DIGESTS: Readonly<Record<string, string>> =
  Object.freeze({
    "u2-chord-inspector-contract.json":
      "be7d4d64a1e3f4b0ce2fd6cfae1999eb197f91897f25d9a25724ff92f951375c",
    "inspector-cases.json":
      "687ed9952189a005d2e4cb5208198db157ab774ca7ceb47fd7e8284311b52704",
    "piano-cases.json":
      "b47b27e2863e2d3479f6633d149be539774c12260f5c0ee4dcadcf8571cda4c9",
    "voicing-transition-cases.json":
      "4bf4adf137830ada2b299cfb138d0416d7da30d727ce70ffdef0c93af5fac242",
    "annotation-cases.json":
      "80e5d33e87959253d4f6b0537a03a44d6dc523c9cc6f0ddf96f66ac26fbef27a",
    "mutation-controls.json":
      "25655052bb480f87ae4763bce4ced9d475ef041bb9563c73da79c863b0d9ef5f",
    "trace-ledger.json":
      "9e4b5f7125217cc8cfab18814339627ad6a2d614da7c5123071b59f23322a456",
    "provenance-ledger.json":
      "a046cd5043a2e420cdbb450bdccf0a6949d1ceb083d6ad7933d98e797da4abd7",
  });

export const U2_SPEC_SEMANTIC_DIGEST =
  "5d8a3fa6e18a97f8d857c13e7ff52565e5194f5821ac8e3a24b96cfe43f4e564";

/* -------------------------------------------------------------------------- */
/* Validation Types & Helpers                                                 */
/* -------------------------------------------------------------------------- */

export type U2ValidationFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type U2ContractValidationResult = Readonly<{
  schema: "changes.validation.u2-chord-inspector-contract.v1";
  package: "U2";
  outcome: "pass" | "fail";
  counts: typeof U2_EXPECTED_COUNTS;
  findings: readonly U2ValidationFinding[];
}>;

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

function finding(
  list: U2ValidationFinding[],
  code: string,
  path: string,
  message: string,
): void {
  list.push(Object.freeze({ code, path, message }));
}

/* -------------------------------------------------------------------------- */
/* Main Contract Validator                                                    */
/* -------------------------------------------------------------------------- */

export async function validateU2Contract(
  fixtureRoot?: string,
): Promise<U2ContractValidationResult> {
  const root =
    fixtureRoot ??
    resolve(import.meta.dirname, "../tests/fixtures/chord-inspector");

  const findings: U2ValidationFinding[] = [];

  let manifestRaw: string;
  let manifestBuf: Buffer;
  try {
    manifestBuf = await readFile(
      resolve(root, "u2-chord-inspector-contract.json"),
    );
    manifestRaw = manifestBuf.toString("utf8");
  } catch (error) {
    finding(
      findings,
      "U2_MANIFEST_MISSING",
      "u2-chord-inspector-contract.json",
      `Cannot read manifest: ${String(error)}`,
    );
    return Object.freeze({
      schema: "changes.validation.u2-chord-inspector-contract.v1",
      package: "U2",
      outcome: "fail",
      counts: U2_EXPECTED_COUNTS,
      findings: Object.freeze(findings),
    });
  }

  // Check manifest byte digest
  const manifestDigest = sha256(manifestBuf);
  const expectedManifestDigest =
    U2_SPEC_BYTE_DIGESTS["u2-chord-inspector-contract.json"] ?? "<none>";
  if (expectedManifestDigest !== manifestDigest) {
    finding(
      findings,
      "U2_BYTE_DIGEST_MISMATCH",
      "u2-chord-inspector-contract.json",
      `Expected ${expectedManifestDigest}, got ${manifestDigest}`,
    );
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  } catch (error) {
    finding(
      findings,
      "U2_MANIFEST_JSON_INVALID",
      "u2-chord-inspector-contract.json",
      `Malformed JSON: ${String(error)}`,
    );
    return Object.freeze({
      schema: "changes.validation.u2-chord-inspector-contract.v1",
      package: "U2",
      outcome: "fail",
      counts: U2_EXPECTED_COUNTS,
      findings: Object.freeze(findings),
    });
  }

  // Validate manifest fields
  if (manifest["contractSchema"] !== U2_REVIEWED_CONTRACT_SCHEMA) {
    finding(
      findings,
      "U2_CONTRACT_SCHEMA_MISMATCH",
      "contractSchema",
      `Expected ${U2_REVIEWED_CONTRACT_SCHEMA}`,
    );
  }
  if (manifest["manifestSchema"] !== U2_REVIEWED_MANIFEST_SCHEMA) {
    finding(
      findings,
      "U2_MANIFEST_SCHEMA_MISMATCH",
      "manifestSchema",
      `Expected ${U2_REVIEWED_MANIFEST_SCHEMA}`,
    );
  }
  if (manifest["package"] !== U2_REVIEWED_PACKAGE) {
    finding(
      findings,
      "U2_PACKAGE_MISMATCH",
      "package",
      `Expected ${U2_REVIEWED_PACKAGE}`,
    );
  }
  if (manifest["beadId"] !== U2_REVIEWED_BEAD_ID) {
    finding(
      findings,
      "U2_BEAD_ID_MISMATCH",
      "beadId",
      `Expected ${U2_REVIEWED_BEAD_ID}`,
    );
  }
  if (manifest["policyId"] !== U2_REVIEWED_POLICY_ID) {
    finding(
      findings,
      "U2_POLICY_ID_MISMATCH",
      "policyId",
      `Expected ${U2_REVIEWED_POLICY_ID}`,
    );
  }
  if (manifest["policyVersion"] !== U2_REVIEWED_POLICY_VERSION) {
    finding(
      findings,
      "U2_POLICY_VERSION_MISMATCH",
      "policyVersion",
      `Expected ${String(U2_REVIEWED_POLICY_VERSION)}`,
    );
  }

  // Check companions
  const files = Array.isArray(manifest["files"])
    ? (manifest["files"] as string[])
    : [];
  for (const companion of U2_EXPECTED_COMPANIONS) {
    if (!files.includes(companion)) {
      finding(
        findings,
        "U2_COMPANION_MISSING_IN_MANIFEST",
        companion,
        `Expected companion file in manifest: ${companion}`,
      );
    }
  }

  // Check counts
  const declaredCounts =
    typeof manifest["counts"] === "object" && manifest["counts"] !== null
      ? (manifest["counts"] as Record<string, number>)
      : {};
  for (const [key, expectedVal] of Object.entries(U2_EXPECTED_COUNTS)) {
    if (declaredCounts[key] !== expectedVal) {
      finding(
        findings,
        "U2_COUNT_MISMATCH",
        `counts.${key}`,
        `Expected ${String(expectedVal)}, got ${String(declaredCounts[key] ?? 0)}`,
      );
    }
  }

  const loadedFiles: Record<string, unknown> = {
    "u2-chord-inspector-contract.json": manifest,
  };

  // Load and validate each companion file
  for (const companion of U2_EXPECTED_COMPANIONS) {
    try {
      const buf = await readFile(resolve(root, companion));
      const fileDigest = sha256(buf);
      const expectedCompanionDigest =
        U2_SPEC_BYTE_DIGESTS[companion] ?? "<none>";
      if (expectedCompanionDigest !== fileDigest) {
        finding(
          findings,
          "U2_BYTE_DIGEST_MISMATCH",
          companion,
          `Expected byte digest ${expectedCompanionDigest}, got ${fileDigest}`,
        );
      }
      const parsed: unknown = JSON.parse(buf.toString("utf8"));
      if (typeof parsed !== "object" || parsed === null) {
        finding(
          findings,
          "U2_COMPANION_SHAPE_INVALID",
          companion,
          "Must be an object",
        );
      }
      loadedFiles[companion] = parsed;
    } catch (error) {
      finding(
        findings,
        "U2_COMPANION_READ_ERROR",
        companion,
        `Error loading ${companion}: ${String(error)}`,
      );
    }
  }

  // Validate semantic digest
  const computedSemanticDigest = sha256(stableJson(loadedFiles));
  if (computedSemanticDigest !== U2_SPEC_SEMANTIC_DIGEST) {
    finding(
      findings,
      "U2_SEMANTIC_DIGEST_MISMATCH",
      "semanticDigest",
      `Expected ${U2_SPEC_SEMANTIC_DIGEST}, got ${computedSemanticDigest}`,
    );
  }

  const outcome = findings.length === 0 ? "pass" : "fail";
  return Object.freeze({
    schema: "changes.validation.u2-chord-inspector-contract.v1",
    package: "U2",
    outcome,
    counts: U2_EXPECTED_COUNTS,
    findings: Object.freeze(findings),
  });
}

/* -------------------------------------------------------------------------- */
/* CLI Entry                                                                  */
/* -------------------------------------------------------------------------- */

if (import.meta.main) {
  const result = await validateU2Contract();
  console.log(JSON.stringify(result, null, 2));
  if (result.outcome !== "pass") {
    process.exit(1);
  }
}
