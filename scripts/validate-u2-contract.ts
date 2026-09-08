/**
 * Independent validator for the proposed U2 Chord Inspector packet.
 *
 * This validator imports no production module. It restates every constant it
 * judges (the U2_REVIEWED_* exports below), checks fixture arithmetic and exact
 * data laws independently, and pins the packet with byte/semantic digests.
 * Mutation references are obligations; only executed tests prove a source kill.
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
export const U2_REVIEWED_POLICY_VERSION = 3;

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
  minMidi: 0,
  maxMidi: 127,
  visibleMinMidi: 36,
  visibleMaxMidi: 84,
  minManualNotes: 1,
  maxManualNotes: 16,
  maxAnnotationCodePoints: 2000,
});

export const U2_REVIEWED_REFUSAL_CODES = Object.freeze([
  "u2.no_selected_chord",
  "u2.invalid_symbol_syntax",
  "u2.unresolvable_chord_symbol",
  "u2.manual_voicing_empty",
  "u2.manual_voicing_exceeds_maximum",
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
  "exact-note-cases.json",
  "auto-policy-cases.json",
] as const);

export const U2_EXPECTED_COUNTS = Object.freeze({
  tabs: 7,
  inspectorCases: 4,
  pianoCases: 4,
  voicingTransitionCases: 7,
  annotationCases: 9,
  mutationControls: 12,
  traces: 11,
  authorities: 7,
  laws: 6,
  exactNoteCases: 8,
  autoPolicyCases: 21,
  workflowCases: 12,
});

export const U2_SPEC_BYTE_DIGESTS: Readonly<Record<string, string>> =
  Object.freeze({
    "u2-chord-inspector-contract.json": "ed953fde365102e7a76665463ff95dc10336c1f2c5099c288e1d3f261b7a9acb",
    "inspector-cases.json": "a5427728c3a396ab7dce985d4fdc080e980ffbc28efe193e7e9536fd6850524a",
    "piano-cases.json": "0f1803c2fac8cc0949317f1e9d84d4e2dced0114a5098fc325feac6561439667",
    "voicing-transition-cases.json": "90b47659028852ee00e56c8dd3ed310d43acb1001b462b06f0af44c1f67f42f2",
    "annotation-cases.json": "27f21cdc6df1d54d00c4911698687cecdae75049e840e4fd6f21cd5647147c18",
    "mutation-controls.json": "e5dc10f8befbed090ae07161d61426d516a38c78eff4aa241a2ef854f4782967",
    "trace-ledger.json": "a59f0098f1185c95786ab8df03143ff7cc39b9e3380732aeda5292efae75f4a8",
    "provenance-ledger.json": "22c1282cbb5ecae259b05dddfbe14f19e0ab6b12d7b2af2860ce9f0c2fab21b4",
    "exact-note-cases.json": "57b902a0bc60af640d4ed6079cee6c70bde9e780af80aa5485957a136d98e03d",
    "auto-policy-cases.json": "887c27a0c176e80b12861369c29babf45dcf8ef5105c30c21c0cce21750d47b7"
});

export const U2_SPEC_SEMANTIC_DIGEST =
  "535640d0c66a9bc922e94c8b7ef3a586600fc114e100f0e76a7262a4ee42a251";

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

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

function items(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

// Independently restated diatonic semitones. No production theory imports.
function semitone(value: unknown): number {
  const pitch = record(value);
  const step = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const base = Object.entries(step).find(([name]) => name === pitch["step"])?.[1];
  const alter = pitch["alter"];
  if (base === undefined || typeof alter !== "number" || !Number.isInteger(alter) || Math.abs(alter) > 2) return NaN;
  return base + alter;
}

function midi(value: unknown): number {
  const octave = record(value)["octave"];
  return typeof octave === "number" && Number.isInteger(octave)
    ? 12 * (octave + 1) + semitone(value) : NaN;
}

/** Also callable without digest checks, so tests cannot hide behind changed pins. */
export function validateU2Semantics(files: Readonly<Record<string, unknown>>): readonly U2ValidationFinding[] {
  const findings: U2ValidationFinding[] = [];
  const check = (actual: unknown, expected: unknown, path: string, code = "U2_EXPECTATION_INVALID") => {
    if (stableJson(actual) !== stableJson(expected)) finding(findings, code, path,
      `Expected ${stableJson(expected)}, got ${stableJson(actual)}`);
  };
  const rows = (file: string, key = "cases") => items(record(files[file])[key]).map(record);
  const idOf = (row: Record<string, unknown>) => typeof row["id"] === "string" ? row["id"] : "<missing-id>";
  const caseFiles = ["inspector-cases.json", "piano-cases.json", "voicing-transition-cases.json", "annotation-cases.json", "exact-note-cases.json", "auto-policy-cases.json"];
  const countKeys = ["inspectorCases", "pianoCases", "voicingTransitionCases", "annotationCases", "exactNoteCases", "autoPolicyCases"];
  const counts = record(record(files["u2-chord-inspector-contract.json"])["counts"]);
  for (const [file, field, countKey] of [
    ["trace-ledger.json", "traces", "traces"],
    ["mutation-controls.json", "controls", "mutationControls"],
    ["provenance-ledger.json", "authorities", "authorities"],
    ["provenance-ledger.json", "laws", "laws"],
  ] as const) check(rows(file, field).length, counts[countKey], `${file}.${field}.count`, "U2_ACTUAL_COUNT_MISMATCH");
  const ids = new Set<string>();
  for (const [index, file] of caseFiles.entries()) {
    check(rows(file).length, counts[countKeys[index] ?? ""], `${file}.count`, "U2_ACTUAL_COUNT_MISMATCH");
    for (const row of rows(file)) {
      const id = idOf(row);
      if (id === "<missing-id>" || ids.has(id)) finding(findings, "U2_CASE_ID_INVALID", file, id);
      ids.add(id);
    }
  }
  for (const row of rows("annotation-cases.json")) {
    const path = idOf(row), raw = row["rawInput"], expected = record(row["expected"]);
    if (typeof raw !== "string") { finding(findings, "U2_ANNOTATION_INVALID", path, "Source must be text"); continue; }
    const count = Array.from(raw).length, valid = count <= 2000;
    check(expected["text"], raw, path + ".text", "U2_ANNOTATION_SOURCE_CHANGED");
    check(expected["codePoints"], count, path + ".codePoints");
    check(expected["isWithinLimit"], valid, path + ".isWithinLimit");
    check(expected["isRefused"], !valid, path + ".isRefused");
    if (!valid) check(expected["refusalCode"], "u2.annotation_length_exceeded", path + ".refusalCode");
  }
  for (const row of rows("exact-note-cases.json")) {
    const path = idOf(row), pitches = items(row["pitches"]), expected = record(row["expected"]);
    const numbers = pitches.map(midi);
    const code = pitches.length === 0 ? "voicing.pitches_empty" : pitches.length > 16 ? "limit.voicing_notes_exceeded"
      : numbers.some(n => !Number.isInteger(n) || n < 0 || n > 127) ? "pitch.midi_out_of_range" : null;
    check(expected["midi"], numbers, path + ".midi", "U2_PITCH_ARITHMETIC_INVALID");
    check(expected["ok"], code === null, path + ".ok");
    if (code === null) check(expected["pitches"], pitches, path + ".pitches", "U2_EXACT_PITCHES_CHANGED");
    else check(expected["code"], code, path + ".code");
  }
  for (const row of rows("auto-policy-cases.json")) {
    const path = idOf(row), policy = record(row["policy"]), expected = record(row["expected"]);
    const family = policy["family"];
    const rootless = family === "rootless-a" || family === "rootless-b";
    const valid = !rootless || policy["bassPolicy"] === "external";
    check(["balanced", "shell", "rootless-a", "rootless-b", "open", "drop2", "quartal"].includes(String(family)), true, path + ".family");
    check(expected["ok"], valid, path + ".ok", "U2_AUTO_POLICY_INVALID");
    check(expected["code"], valid ? null : "voicing.rootless_requires_external", path + ".code");
  }
  for (const row of rows("piano-cases.json")) {
    const path = idOf(row);
    if (row["totalKeys"] !== undefined) {
      check(row["minMidi"], 0, path + ".minMidi"); check(row["maxMidi"], 127, path + ".maxMidi");
      check(row["totalKeys"], 128, path + ".totalKeys");
      check(row["whiteKeyCount"], 75, path + ".whiteKeyCount"); check(row["blackKeyCount"], 53, path + ".blackKeyCount");
      check(row["visibleKeyCount"], 49, path + ".visibleKeyCount");
    }
    for (const key of items(row["expectedKeyRoles"]).map(record)) {
      const note = key["midi"], spelling = record(key["spelling"]);
      if (typeof note !== "number") { finding(findings, "U2_PIANO_INVALID", path, "Missing MIDI coordinate"); continue; }
      const pc = ((semitone(spelling) % 12) + 12) % 12;
      check(key["pitchClass"], note % 12, path + ".pitchClass", "U2_PITCH_ARITHMETIC_INVALID");
      check(pc, note % 12, path + ".spelling", "U2_PITCH_ARITHMETIC_INVALID");
      check(key["isBlack"], [1,3,6,8,10].includes(note % 12), path + ".isBlack");
    }
    if (row["duplicateUnisonRejected"] !== undefined) check(row["duplicateUnisonRejected"], false, path + ".duplicateUnisonRejected");
  }
  for (const row of rows("inspector-cases.json")) {
    const path = idOf(row), view = record(row["expected"]), voice = record(view["voicing"]), notes = record(view["notes"]);
    const selected = record(row["selectedChord"]), mode = selected["voicingMode"];
    const pitches = items(voice["activePitches"]);
    if (row["selectedChord"] !== null) {
      check(pitches, selected["pitches"], path + ".voicing.input", "U2_EXACT_PITCHES_CHANGED");
      check(voice["mode"], mode, path + ".voicing.mode");
      check(voice["family"], selected["voicingFamily"], path + ".voicing.family");
      check(notes["rawAnnotation"], selected["annotation"], path + ".notes.input", "U2_ANNOTATION_SOURCE_CHANGED");
    }
    check(voice["canSwitchToFrozen"], mode === "auto" && pitches.length > 0,
      path + ".voicing.canSwitchToFrozen", "U2_FROZEN_PROVENANCE_INVENTED");
    const motion = record(view["motion"]), paths = items(motion["voicePaths"]).map(record);
    check(motion["nextChordSymbol"], row["nextChordSymbol"] ?? null, path + ".motion.next", "U2_MOTION_INPUT_MISSING");
    check(motion["previousChordSymbol"], null, path + ".motion.previous", "U2_MOTION_INPUT_MISSING");
    if (paths.length > 0) {
      check(paths.map(arc => arc["fromPitch"]), pitches, path + ".motion.from", "U2_MOTION_INPUT_MISSING");
      check(paths.map(arc => arc["toPitch"]), row["nextVoicingPitches"], path + ".motion.to", "U2_MOTION_INPUT_MISSING");
    }
    const distances = paths.map(arc => Math.abs(midi(arc["fromPitch"]) - midi(arc["toPitch"])));
    for (const [index, distance] of distances.entries()) {
      check(paths[index]?.["intervalSemis"], distance, path + ".motion.interval", "U2_MOTION_ARITHMETIC_INVALID");
      check(paths[index]?.["motionType"], distance === 0 ? "common" : distance <= 2 ? "step" : distance <= 4 ? "skip" : "leap",
        path + ".motion.type", "U2_MOTION_ARITHMETIC_INVALID");
    }
    check(motion["commonToneCount"], distances.filter(distance => distance === 0).length, path + ".motion.common");
    check(motion["stepwiseMotionCount"], distances.filter(distance => distance > 0 && distance <= 2).length, path + ".motion.steps");
    if (record(row["analysisContext"])["key"] === undefined)
      check(record(view["harmony"])["romanNumeral"], null, path + ".harmony.roman", "U2_ANALYSIS_INPUT_MISSING");
    check(voice["midiNoteNumbers"], items(voice["activePitches"]).map(midi), path + ".voicing.midi", "U2_PITCH_ARITHMETIC_INVALID");
    check(notes["text"], notes["rawAnnotation"], path + ".notes.text", "U2_ANNOTATION_SOURCE_CHANGED");
    check(notes["codePointCount"], typeof notes["text"] === "string" ? Array.from(notes["text"]).length : null, path + ".notes.codePoints");
    check(notes["maxCodePoints"], 2000, path + ".notes.maxCodePoints");
    for (const degree of items(record(view["structure"])["degrees"]).map(record))
      check(degree["pitchClass"], ((semitone(degree["spelling"]) % 12) + 12) % 12, path + ".degree.pitchClass", "U2_PITCH_ARITHMETIC_INVALID");
  }
  for (const row of rows("voicing-transition-cases.json")) {
    const path = idOf(row), expected = record(row["expectedOutcome"]);
    if (row["toMode"] === "auto") {
      const code = row["confirmDiscardManual"] !== true ? "u2.mode_switch_requires_confirmation"
        : row["requestedAuto"] === null || row["requestedAuto"] === undefined ? "voicing.auto_settings_required" : null;
      check(expected["ok"], code === null, path + ".ok");
      if (code !== null) check(expected["code"], code, path + ".code");
    } else {
      check(expected["resultingPitches"], row["synthesizedAutoPitches"], path + ".pitches", "U2_EXACT_PITCHES_CHANGED");
    }
  }
  const workflows = rows("voicing-transition-cases.json", "workflows");
  check(workflows.length, counts["workflowCases"], "workflowCases", "U2_ACTUAL_COUNT_MISMATCH");
  for (const row of workflows) {
    const path = idOf(row), expected = record(row["expected"]), action = row["action"];
    if (ids.has(path)) finding(findings, "U2_CASE_ID_INVALID", path, "Duplicate workflow ID");
    ids.add(path);
    const refused = row["sourceRevision"] !== row["currentRevision"] || action === "return-auto" && row["confirmed"] !== true;
    const commits = !refused && ["apply-auto", "keep", "edit-exact-notes", "return-auto"].includes(String(action));
    check(expected["documentWrites"], commits ? 1 : 0, path + ".documentWrites");
    check(expected["undoSteps"], commits ? 1 : 0, path + ".undoSteps");
    check(expected["previewStarts"], action === "hear" && !refused ? 1 : 0, path + ".previewStarts");
    if (refused) check(expected["refused"], true, path + ".refused");
    if (action === "hear" && !refused) check(expected["soundedPitches"], row["pitches"], path + ".soundedPitches", "U2_EXACT_PITCHES_CHANGED");
    if (["cancel", "global-stop", "selection-change"].includes(String(action))) check(expected["futurePreviewStarts"], 0, path + ".futurePreviewStarts");
  }
  for (const row of rows("trace-ledger.json", "traces")) {
    for (const id of items(row["cases"])) check(ids.has(String(id)), true, idOf(row) + ".case", "U2_TRACE_CASE_MISSING");
  }
  const traceIds = new Set(rows("trace-ledger.json", "traces").map(idOf));
  for (const file of caseFiles) for (const row of rows(file)) {
    check(items(row["traceIds"]).length > 0, true, idOf(row) + ".traceIds");
    for (const id of items(row["traceIds"])) check(traceIds.has(String(id)), true, idOf(row) + ".trace", "U2_CASE_TRACE_MISSING");
  }
  for (const row of rows("mutation-controls.json", "controls"))
    check(ids.has(String(row["killedByCase"])), true, idOf(row), "U2_MUTATION_CASE_MISSING");
  return Object.freeze(findings);
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

  findings.push(...validateU2Semantics(loadedFiles));

  // Digest pins are additional integrity checks, not semantic authority.
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
