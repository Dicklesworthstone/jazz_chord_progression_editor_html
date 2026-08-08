import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  APPLICATION_DIALOG_KINDS,
  type EphemeralIntent,
} from "../../src/application";
import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
} from "../../src/domain";
import {
  MAX_MIDI_EXPORT_BYTES,
  MAX_MIDI_EXPORT_FILENAME_CHARS,
  MAX_MIDI_EXPORT_MARKERS,
  MAX_MIDI_EXPORT_TEXT_UTF8_BYTES,
  MIDI_EXPORT_FILENAME_PREFIX,
  MIDI_EXPORT_FILENAME_SUFFIX,
  MIDI_EXPORT_REFUSAL_CODES,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  MIDI_EXPORT_WRITER_VERSION_TAG,
} from "../../src/export/midi-export-contract";
import { PLAYBACK_PLAN_MIDI_PPQ } from "../../src/playback/playback-plan-contract";
import { formatChordSymbol, parseChordSymbol } from "../../src/theory";
import { UI_LIMITS } from "../../src/ui/ui-contract";
import { PREPARED_CANONICAL_EXPORT_REGISTRY_STATES } from "../../src/application/e0-interchange-contract";
import {
  U7_APPLICATION_DIALOG_KINDS_WITH_MIDI_EXPORT,
  U7_AUTHORIZED_COMMAND_KINDS,
  U7_AUTHORIZED_EPHEMERAL_INTENT_KINDS,
  U7_CANCELABLE_STATES,
  U7_COMPONENT_COUNT,
  U7_COMPONENT_INVENTORY,
  U7_E1_WRITER_ID,
  U7_E1_WRITER_VERSION,
  U7_E1_WRITER_VERSION_TAG,
  U7_EXISTING_APPLICATION_DIALOG_KINDS,
  U7_FILENAME_PREFIX,
  U7_FILENAME_SUFFIX,
  U7_FORBIDDEN_EPHEMERAL_INTENT_KINDS,
  U7_LAW_IDS,
  U7_MARKER_OMISSION_REASONS,
  U7_MIDI_PPQ,
  U7_MIDI_TRACK_COUNT,
  U7_MIDI_EXPORT_WORKFLOW_BEAD_ID,
  U7_MIDI_EXPORT_WORKFLOW_CONTRACT_SCHEMA,
  U7_MIDI_EXPORT_WORKFLOW_IMPLEMENTATION_STATUS,
  U7_MIDI_EXPORT_WORKFLOW_POLICY_ID,
  U7_MIDI_EXPORT_WORKFLOW_POLICY_VERSION,
  U7_PREPARATION_REGISTRY_STATES,
  U7_PREVIEW_BLOCKER_KINDS,
  U7_PREVIEW_WORK_COUNTER_MAXIMA,
  U7_PREVIEW_WORK_COUNTER_NAMES,
  U7_ANNOUNCEMENT_KEYS,
  U7_STALE_OUTCOME_CODE,
  U7_WORKFLOW_ACTIONS,
  U7_WORKFLOW_LIMITS,
  U7_WORKFLOW_REFUSAL_CODES,
  U7_WORKFLOW_STATES,
} from "../../src/application/u7-midi-export-workflow-contract";
import {
  U7_REVIEWED_ANNOUNCEMENT_KEYS,
  U7_REVIEWED_BLOCKER_KINDS,
  U7_REVIEWED_CANCELABLE_STATES,
  U7_REVIEWED_COMPONENTS,
  U7_REVIEWED_EXISTING_DIALOG_KINDS,
  U7_REVIEWED_LAW_IDS,
  U7_REVIEWED_LIMITS,
  U7_REVIEWED_OMISSION_REASONS,
  U7_REVIEWED_REFUSAL_CODES,
  U7_REVIEWED_REGISTRY_STATES,
  U7_REVIEWED_WORKFLOW_ACTIONS,
  U7_REVIEWED_WORKFLOW_STATES,
  validateU7Contract,
  type U7ContractValidationReport,
} from "../../scripts/validate-u7-contract";

setDefaultTimeout(60_000);

const fixtureRoot = resolvePath("tests/fixtures/midi-export-workflow");

type JsonObject = Record<string, unknown>;

function requireObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("U7_TEST_OBJECT_REQUIRED");
  }
  return value as JsonObject;
}

async function readJson(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")));
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJson(path);
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "jcpe-u7-contract-"));
  const root = join(parent, "reviewed midi export workflow fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
}

function codes(report: U7ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((item) => item.code))].sort();
}

async function expectRejected(
  root: string,
  ...expectedCodes: readonly string[]
): Promise<void> {
  const report = await validateU7Contract(root, { allowPendingFreeze: true });
  expect(report.outcome).toBe("fail");
  for (const code of expectedCodes) expect(codes(report)).toContain(code);
}

/** Recursive production-source walk for sealed-packet and refusal-site proofs. */
function productionSources(root: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      out.push(...productionSources(path));
    } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

const srcFiles = productionSources(resolvePath("src"));

describe("U7 reviewed MIDI-export-workflow contract", () => {
  test("accepts the reviewed packet deterministically", async () => {
    const first = await validateU7Contract(fixtureRoot);
    const second = await validateU7Contract(fixtureRoot);
    expect(second).toEqual(first);
    expect(first).toEqual({
      schema: "changes.validation.u7-contract.v1",
      package: "U7",
      outcome: "pass",
      reviewState: "proposed-independent-spec",
      pinState: "reviewed-byte-and-semantic-pinned",
      productionImplementationClaim: false,
      uiCompletionClaim: false,
      humanAcceptanceClaim: false,
      expertReviewClaim: false,
      counts: {
        companions: 6,
        previewCases: 10,
        stateCases: 24,
        accessibilityMatrixRows: 12,
        limitCases: 10,
        traces: 16,
        authorities: 11,
        mutationControls: 16,
        mutationControlsReplayed: 16,
      },
      findings: [],
    });
  });

  test("freezes the source contract module against the reviewed packet", () => {
    expect(U7_MIDI_EXPORT_WORKFLOW_CONTRACT_SCHEMA).toBe(
      "changes.application.u7-midi-export-workflow-contract.v1",
    );
    expect(U7_MIDI_EXPORT_WORKFLOW_POLICY_ID).toBe(
      "changes.u7-midi-export-workflow",
    );
    expect(U7_MIDI_EXPORT_WORKFLOW_POLICY_VERSION).toBe(1);
    expect(U7_MIDI_EXPORT_WORKFLOW_BEAD_ID).toBe(
      "jcpe-milestone-advanced-craft-ulj.11.1",
    );
    expect(U7_MIDI_EXPORT_WORKFLOW_IMPLEMENTATION_STATUS).toBe(
      "specified-not-implemented",
    );
    expect([...U7_WORKFLOW_STATES]).toEqual([...U7_REVIEWED_WORKFLOW_STATES]);
    expect([...U7_WORKFLOW_ACTIONS]).toEqual([...U7_REVIEWED_WORKFLOW_ACTIONS]);
    expect([...U7_CANCELABLE_STATES]).toEqual([...U7_REVIEWED_CANCELABLE_STATES]);
    expect([...U7_PREPARATION_REGISTRY_STATES]).toEqual([
      ...U7_REVIEWED_REGISTRY_STATES,
    ]);
    expect([...U7_WORKFLOW_REFUSAL_CODES]).toEqual([...U7_REVIEWED_REFUSAL_CODES]);
    expect(U7_STALE_OUTCOME_CODE).toBe("u7.revision_stale");
    expect([...U7_PREVIEW_BLOCKER_KINDS]).toEqual([...U7_REVIEWED_BLOCKER_KINDS]);
    expect([...U7_MARKER_OMISSION_REASONS]).toEqual([
      ...U7_REVIEWED_OMISSION_REASONS,
    ]);
    expect([...U7_ANNOUNCEMENT_KEYS]).toEqual([...U7_REVIEWED_ANNOUNCEMENT_KEYS]);
    expect([...U7_LAW_IDS]).toEqual([...U7_REVIEWED_LAW_IDS]);
    expect(U7_WORKFLOW_LIMITS).toEqual(U7_REVIEWED_LIMITS);
    expect([...U7_COMPONENT_INVENTORY]).toEqual([...U7_REVIEWED_COMPONENTS]);
    expect(U7_COMPONENT_COUNT).toBe(12);
    expect([...U7_EXISTING_APPLICATION_DIALOG_KINDS]).toEqual([
      ...U7_REVIEWED_EXISTING_DIALOG_KINDS,
    ]);
  });

  test("binds every restated upstream pin to its live authority", () => {
    expect(U7_WORKFLOW_LIMITS.maxMarkerTextUtf8Bytes).toBe(
      MAX_MIDI_EXPORT_TEXT_UTF8_BYTES,
    );
    expect(MAX_MIDI_EXPORT_MARKERS).toBe(U7_WORKFLOW_LIMITS.maxMarkers);
    expect(U7_WORKFLOW_LIMITS.maxArtifactBytes).toBe(MAX_MIDI_EXPORT_BYTES);
    expect(U7_WORKFLOW_LIMITS.maxFilenameCharacters).toBe(
      MAX_MIDI_EXPORT_FILENAME_CHARS,
    );
    expect(U7_WORKFLOW_LIMITS.maxChordEvents).toBe(MAX_DOCUMENT_CHORD_EVENTS);
    expect(U7_WORKFLOW_LIMITS.maxSections).toBe(MAX_DOCUMENT_SECTIONS);
    expect(U7_WORKFLOW_LIMITS.compactBreakpointCssPx).toBe(
      UI_LIMITS.compactBreakpointCssPx,
    );
    expect(U7_E1_WRITER_ID).toBe(MIDI_EXPORT_WRITER_ID);
    expect(U7_E1_WRITER_VERSION).toBe(MIDI_EXPORT_WRITER_VERSION);
    expect(U7_E1_WRITER_VERSION_TAG).toBe(MIDI_EXPORT_WRITER_VERSION_TAG);
    expect(U7_MIDI_PPQ).toBe(PLAYBACK_PLAN_MIDI_PPQ);
    expect(U7_MIDI_TRACK_COUNT).toBe(2);
    expect(MIDI_EXPORT_WRITER_VERSION).toBe(1);
    expect(MIDI_EXPORT_WRITER_VERSION_TAG).toBe("changes.midi-export.v1");
    expect(PLAYBACK_PLAN_MIDI_PPQ).toBe(960);
    expect(U7_FILENAME_PREFIX).toBe(MIDI_EXPORT_FILENAME_PREFIX);
    expect(U7_FILENAME_SUFFIX).toBe(MIDI_EXPORT_FILENAME_SUFFIX);
    /* the E1 marker cap is exactly events + sections: overflow unreachable */
    expect(MAX_MIDI_EXPORT_MARKERS).toBe(
      MAX_DOCUMENT_CHORD_EVENTS + MAX_DOCUMENT_SECTIONS,
    );
    /* the accepted A0 dialog kinds are restated exactly; the proposed kind appends */
    expect([...APPLICATION_DIALOG_KINDS]).toEqual([
      ...U7_EXISTING_APPLICATION_DIALOG_KINDS,
    ]);
    expect([...U7_APPLICATION_DIALOG_KINDS_WITH_MIDI_EXPORT]).toEqual([
      ...APPLICATION_DIALOG_KINDS,
      "midi-export",
    ]);
    expect(APPLICATION_DIALOG_KINDS).not.toContain("midi-export");
    /* the registry vocabulary mirrors accepted E0 v1 structurally */
    expect([...U7_PREPARATION_REGISTRY_STATES]).toEqual([
      ...PREPARED_CANONICAL_EXPORT_REGISTRY_STATES,
    ]);
    /* channel discipline: no mutation channel, no marker/recovery intents */
    expect([...U7_AUTHORIZED_COMMAND_KINDS]).toEqual([]);
    expect([...U7_AUTHORIZED_EPHEMERAL_INTENT_KINDS]).toEqual([
      "push-dialog",
      "pop-dialog",
    ]);
    type LiveIntentKind = EphemeralIntent["kind"];
    type AuthorizedIntentKind =
      (typeof U7_AUTHORIZED_EPHEMERAL_INTENT_KINDS)[number];
    const authorizedIntentAssertions: AuthorizedIntentKind extends LiveIntentKind
      ? true
      : false = true;
    expect([authorizedIntentAssertions]).toEqual([true]);
    for (const forbidden of U7_FORBIDDEN_EPHEMERAL_INTENT_KINDS) {
      expect(["mark-exported", "set-recovery"]).toContain(forbidden);
    }
    expect(U7_PREVIEW_WORK_COUNTER_NAMES).toHaveLength(3);
    expect(U7_PREVIEW_WORK_COUNTER_MAXIMA["events-visited"]).toBe(
      MAX_DOCUMENT_CHORD_EVENTS,
    );
    expect(MAX_MIDI_EXPORT_MARKERS).toBe(
      U7_PREVIEW_WORK_COUNTER_MAXIMA["markers-derived"],
    );
    expect(U7_PREVIEW_WORK_COUNTER_MAXIMA["bytes-hashed"]).toBe(
      MAX_MIDI_EXPORT_BYTES,
    );
  });

  test("fixture literal chord markers match the accepted T0 formatter", async () => {
    const preview = await readJson(join(fixtureRoot, "preview-cases.json"));
    const cases = preview["cases"];
    expect(Array.isArray(cases)).toBe(true);
    if (!Array.isArray(cases)) return;
    let checked = 0;
    for (const entry of cases) {
      const scenario = requireObject(requireObject(entry)["scenario"]);
      const sections = scenario["sections"];
      if (!Array.isArray(sections)) continue;
      for (const section of sections) {
        const events = requireObject(section)["events"];
        if (!Array.isArray(events)) continue;
        for (const event of events) {
          const chord = requireObject(requireObject(event)["chord"]);
          if (chord["kind"] === "custom") {
            expect(chord["canonicalMarkerText"] ?? chord["label"]).toBe(chord["label"]);
            continue;
          }
          if (chord["kind"] !== "parsed") continue;
          const marker = chord["canonicalMarkerText"];
          if (typeof marker !== "string") continue;
          const parsed = parseChordSymbol(String(chord["sourceText"]), "unicode");
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) continue;
          const formatted = formatChordSymbol(parsed.chord, "unicode");
          expect(formatted.ok).toBe(true);
          if (!formatted.ok) continue;
          expect(marker).toBe(formatted.canonicalText);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  test("declared upstream refusal codes exist in their owning vocabularies", () => {
    /* the E1 codes a blocked preview may carry are the live E1 union */
    expect([...MIDI_EXPORT_REFUSAL_CODES]).toContain("midi.plan_invalid");
    const sources = srcFiles
      .filter((path) => !path.endsWith("u7-midi-export-workflow-contract.ts"))
      .map((path) => readFileSync(path, "utf8"));
    const joined = sources.join("\n");
    expect(joined).toContain('"playback.custom_voicing_missing"');
    expect(joined).toContain('"voicing.constraints_unsatisfied"');
  });

  test("the proposed packet is sealed: no production consumer exists", () => {
    for (const path of srcFiles) {
      if (path.endsWith("u7-midi-export-workflow-contract.ts")) continue;
      const source = readFileSync(path, "utf8");
      expect(source.includes("u7-midi-export-workflow-contract")).toBe(false);
    }
    /* and no production site can raise a U7 refusal code yet */
    for (const path of srcFiles) {
      if (path.endsWith("u7-midi-export-workflow-contract.ts")) continue;
      const source = readFileSync(path, "utf8");
      for (const code of U7_WORKFLOW_REFUSAL_CODES) {
        expect(source.includes(`"${code}"`)).toBe(false);
      }
    }
  });

  test("the validator imports no production source", () => {
    const source = readFileSync(
      resolvePath("scripts/validate-u7-contract.ts"),
      "utf8",
    );
    const importSpecifiers = [
      ...source.matchAll(/from\s+"([^"]+)"/g),
    ].map((match) => match[1]);
    for (const specifier of importSpecifiers) {
      expect(specifier).toMatch(/^node:/);
    }
  });

  test("rejects a tampered file set", async () => {
    await withFixtureCopy(async (root) => {
      await writeFile(join(root, "stray.json"), "{}\n", "utf8");
      await expectRejected(root, "U7_CONTRACT_FILE_SET");
    });
  });

  test("rejects a missing companion", async () => {
    await withFixtureCopy(async (root) => {
      await rm(join(root, "preview-cases.json"));
      await expectRejected(root, "U7_CONTRACT_FILE_SET", "U7_CONTRACT_FILE_MISSING");
    });
  });

  test("rejects duplicate keys", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "limit-cases.json");
      const raw = await readFile(path, "utf8");
      const tampered = raw.replace(
        '"fixtureVersion": "1.0.0",',
        '"fixtureVersion": "1.0.0",\n  "fixtureVersion": "1.0.0",',
      );
      await writeFile(path, tampered, "utf8");
      await expectRejected(root, "U7_CONTRACT_DUPLICATE_KEY");
    });
  });

  test("rejects premature acceptance claims", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "u7-midi-export-workflow-contract.json", (value) => {
        value["productionImplementationClaim"] = true;
      });
      await expectRejected(root, "U7_CONTRACT_VERSION");
    });
  });

  test("rejects a flipped independence flag", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "provenance-ledger.json", (value) => {
        value["productionOutputUsedAsOracle"] = true;
      });
      await expectRejected(root, "U7_CONTRACT_INDEPENDENCE");
    });
  });

  test("rejects a tampered artifact hash", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "preview-cases.json", (value) => {
        const cases = value["cases"];
        if (!Array.isArray(cases)) throw new Error("cases required");
        const first = requireObject(cases[0]);
        const preview = requireObject(first["expectedPreview"]);
        const artifact = requireObject(preview["artifact"]);
        artifact["sha256"] =
          "0000000000000000000000000000000000000000000000000000000000000000";
      });
      await expectRejected(root, "U7_CONTRACT_HASH_RELATION");
    });
  });

  test("rejects a tampered transition", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "state-cases.json", (value) => {
        const cases = value["cases"];
        if (!Array.isArray(cases)) throw new Error("cases required");
        requireObject(cases[6])["registryAfter"] = "ready";
      });
      await expectRejected(root, "U7_CONTRACT_STATE_CASE");
    });
  });

  test("rejects an incomplete accessibility matrix", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "state-cases.json", (value) => {
        const matrix = value["accessibilityMatrix"];
        if (!Array.isArray(matrix)) throw new Error("matrix required");
        matrix.pop();
      });
      await expectRejected(root, "U7_CONTRACT_MATRIX", "U7_CONTRACT_LIMIT_CASE", "U7_CONTRACT_COUNT");
    });
  });

  test("rejects a fabricated law-coverage gap", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const coverage = value["lawCoverage"];
        if (!Array.isArray(coverage)) throw new Error("coverage required");
        coverage.pop();
      });
      await expectRejected(root, "U7_CONTRACT_LAW_COVERAGE");
    });
  });
});
