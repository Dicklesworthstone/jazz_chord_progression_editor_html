/**
 * Independent X1 transport-contract validator.
 *
 * Validates the reviewed fixture authority under `tests/fixtures/transport/`
 * against an internal restatement of docs/X1_TRANSPORT_CONTRACT.md. It
 * imports no production transport code (none exists) and never imports
 * `src/`; every expected value below is restated by hand so production
 * output can be checked against this authority without certifying itself.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

export type X1Finding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type X1ValidationReport = Readonly<{
  schema: "changes.validation.x1-transport-contract.v1";
  outcome: "pass" | "fail";
  fixtureFiles: number;
  stateMatrixCases: number;
  timingGoldens: number;
  schedulerCases: number;
  stopCases: number;
  commandCases: number;
  notificationCases: number;
  traces: number;
  authorities: number;
  mutationControls: number;
  findings: readonly X1Finding[];
}>;

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_DIR = resolve(ROOT, "tests/fixtures/transport");

export const X1_FIXTURE_FILES = Object.freeze([
  "x1-transport-contract.json",
  "state-machine-cases.json",
  "golden-timing.json",
  "scheduler-cases.json",
  "stop-cases.json",
  "command-cases.json",
  "notification-cases.json",
  "mutation-controls.json",
  "trace-ledger.json",
  "provenance-ledger.json",
] as const);

const STATES = Object.freeze([
  "locked",
  "ready",
  "playing",
  "paused",
  "interrupted",
  "fault",
  "disposed",
] as const);

const COMMAND_KINDS = Object.freeze([
  "initialize-transport",
  "play",
  "pause",
  "resume",
  "seek",
  "stop",
  "set-tempo",
  "set-loop",
  "set-instrument",
  "set-count-in",
  "set-metronome",
  "start-preview",
  "release-preview",
  "replace-plan",
  "dispose-transport",
] as const);

const NOTIFICATION_STATUSES = Object.freeze([
  "ready",
  "playing",
  "paused",
  "failed",
] as const);

const PROJECTION = Object.freeze({
  ready: "ready",
  playing: "playing",
  paused: "paused",
  interrupted: "paused",
  fault: "failed",
} as const);

const REFUSAL_CODES = Object.freeze([
  "transport.locked",
  "transport.disposed",
  "transport.fault_requires_initialize",
  "transport.state_invalid",
  "transport.gesture_invalid",
  "transport.command_request_id_invalid",
  "transport.queue_overflow",
  "transport.timing_policy_invalid",
  "transport.plan_invalid",
  "transport.plan_mismatch",
  "transport.start_beat_out_of_range",
  "transport.seek_out_of_range",
  "transport.tempo_out_of_range",
  "transport.loop_invalid",
  "transport.instrument_unknown",
  "transport.preview_invalid",
  "transport.count_in_invalid",
  "transport.metronome_invalid",
  "transport.engine_refusal",
  "transport.internal_sequence_exhausted",
] as const);

const REFUSAL_PRECEDENCE = Object.freeze([
  "transport.disposed",
  "transport.locked",
  "transport.command_request_id_invalid",
  "transport.queue_overflow",
  "transport.fault_requires_initialize",
  "transport.state_invalid",
  "transport.gesture_invalid",
  "transport.timing_policy_invalid",
  "transport.plan_invalid",
  "transport.plan_mismatch",
  "transport.start_beat_out_of_range",
  "transport.seek_out_of_range",
  "transport.tempo_out_of_range",
  "transport.loop_invalid",
  "transport.instrument_unknown",
  "transport.preview_invalid",
  "transport.count_in_invalid",
  "transport.metronome_invalid",
  "transport.engine_refusal",
  "transport.internal_sequence_exhausted",
] as const);

const WORK_COUNTERS = Object.freeze([
  "commandsAdmitted",
  "commandsRefused",
  "schedulerTicks",
  "eventsScheduled",
  "attackBatchesIssued",
  "clickEventsGenerated",
  "horizonReschedules",
  "loopWraps",
  "generationsRetired",
  "previewsStarted",
  "previewsReleased",
  "naturalEndsPublished",
  "notificationsPublished",
  "staleCallbacksIgnored",
  "interruptionsObserved",
] as const);

const GENERATION_BOUNDARIES = Object.freeze([
  "play",
  "pause",
  "resume",
  "seek",
  "stop",
  "set-tempo",
  "set-loop",
  "loop-wrap",
  "replace-plan",
  "interruption",
  "interruption-recovery",
  "natural-end",
  "fault",
] as const);

const LIMITS = Object.freeze({
  tickIntervalMsDefault: 25,
  tickIntervalMsMin: 10,
  tickIntervalMsMax: 100,
  lookaheadSecondsDefault: 0.1,
  lookaheadSecondsMin: 0.05,
  lookaheadSecondsMax: 0.2,
  x0AttackWindowSeconds: 0.25,
  x0WindowMarginSeconds: 0.05,
  maxQueuedCommands: 32,
  naturalEndTailDeadlineSeconds: 8,
  stopReleaseSeconds: 0.012,
  previewReleaseSeconds: 0.04,
  minAudioGateSeconds: 0.005,
  maxPreviewPitches: 16,
  countInBars: 1,
  tempoBpmMin: 20,
  tempoBpmMax: 400,
  maxSafeSequence: 9007199254740991,
} as const);

const CLICK_POLICY = Object.freeze({
  instrumentId: "vibraphone",
  accentMidiPitch: 88,
  beatMidiPitch: 81,
  accentVelocity: 112,
  beatVelocity: 84,
  gateSeconds: 0.06,
  eventIdPrefix: "x1:click:",
} as const);

const PREVIEW_ID_PREFIX = "x1:preview:";
const INSTRUMENT_IDS = Object.freeze([
  "mellow-keys",
  "fm-electric-piano",
  "vibraphone",
  "warm-pad",
  "analog-poly",
] as const);

/** X0 v1 refusal codes pinned for the engine-boundary witnesses. */
const X0_REFUSAL_CODES_PINNED = Object.freeze([
  "audio.retiring_voice_capacity",
  "audio.instrument_id_invalid",
  "audio.internal_sequence_exhausted",
] as const);

const STOP_ORDER = Object.freeze([
  "serialize-transition",
  "increment-generation",
  "clear-scheduler-handles",
  "retire-progression-and-previews",
  "await-no-future-attack-receipts",
  "clear-cursor-and-anchors",
  "playhead-to-start-beat",
  "publish-ready",
] as const);

const REQUIRED_TRACE_IDS = Object.freeze([
  "TR-X1-STATE-MACHINE",
  "TR-X1-SERIALIZED-COMMANDS",
  "TR-X1-LOOKAHEAD-SCHEDULER",
  "TR-X1-EXACT-TIME",
  "TR-X1-STOP-GUARANTEE",
  "TR-X1-PLAY-WHOLE-CHART",
  "TR-X1-PAUSE-RESUME-SEEK",
  "TR-X1-TEMPO-LOOP",
  "TR-X1-INSTRUMENT",
  "TR-X1-CLICKS",
  "TR-X1-PREVIEW",
  "TR-X1-NATURAL-END-REPLAY",
  "TR-X1-INTERRUPTION",
  "TR-X1-REPLACEMENT",
  "TR-X1-NOTIFICATIONS",
  "TR-X1-ENGINE-BOUNDARY",
  "TR-X1-BROWSER-MATRIX",
  "TR-X1-LISTENING",
  "TR-LEGACY-RUNTIME-01",
  "TR-LEGACY-AUDIO-01",
  "TR-LEGACY-AUDIO-03",
  "TR-LEGACY-AUDIO-04",
] as const);

const REQUIRED_AUTHORITY_IDS = Object.freeze([
  "AUTH-WEB-AUDIO",
  "AUTH-PLAN-X1",
  "AUTH-X0-CONTRACT",
  "AUTH-P0-CONTRACT",
  "AUTH-A0-CONTRACT",
  "AUTH-LEGACY-AUDIT",
  "AUTH-X1-DECISIONS",
  "AUTH-HUMAN-LISTENING",
] as const);

const FINDING_CODES = Object.freeze([
  "X1_SCHEMA",
  "X1_MANIFEST_COMPANION",
  "X1_STATES",
  "X1_PROJECTION",
  "X1_REFUSALS",
  "X1_LIMITS",
  "X1_STATE_MATRIX",
  "X1_TIMING_GOLDEN",
  "X1_SCHEDULER_CASES",
  "X1_STOP_CASES",
  "X1_COMMAND_CASES",
  "X1_NOTIFICATION_CASES",
  "X1_TRACE",
  "X1_PROVENANCE",
  "X1_MUTATION_CONTROLS",
] as const);

type Cell =
  | Readonly<{ outcome: "receipt"; stateAfter: string; generationBoundary: boolean }>
  | Readonly<{ outcome: "refusal"; refusalCode: string }>;

function receipt(stateAfter: string, generationBoundary: boolean): Cell {
  return Object.freeze({ outcome: "receipt", stateAfter, generationBoundary });
}
function refusal(refusalCode: string): Cell {
  return Object.freeze({ outcome: "refusal", refusalCode });
}

/**
 * Independent restatement of the full state-machine rule table
 * (docs/X1_TRANSPORT_CONTRACT.md section 2). Keyed `${command}|${state}`.
 */
function expectedCell(command: string, state: string): Cell | null {
  if (state === "disposed") return refusal("transport.disposed");
  if (command === "initialize-transport") {
    if (state === "locked" || state === "fault") return receipt("ready", false);
    return refusal("transport.state_invalid");
  }
  if (state === "locked") {
    if (command === "dispose-transport") return receipt("disposed", false);
    return refusal("transport.locked");
  }
  if (state === "fault") {
    if (command === "dispose-transport") return receipt("disposed", false);
    return refusal("transport.fault_requires_initialize");
  }
  switch (command) {
    case "play":
      return state === "ready"
        ? receipt("playing", true)
        : refusal("transport.state_invalid");
    case "pause":
      return state === "playing"
        ? receipt("paused", true)
        : refusal("transport.state_invalid");
    case "resume":
      if (state === "paused") return receipt("playing", true);
      if (state === "interrupted") return receipt("prior-stable", true);
      return refusal("transport.state_invalid");
    case "seek":
      if (state === "playing") return receipt("playing", true);
      if (state === "paused") return receipt("paused", true);
      return refusal("transport.state_invalid");
    case "stop":
      if (state === "ready") return receipt("ready", false);
      return receipt("ready", true);
    case "set-tempo":
    case "set-loop":
      if (state === "interrupted") return refusal("transport.state_invalid");
      return receipt(state, state !== "ready");
    case "set-instrument":
    case "set-count-in":
    case "set-metronome":
    case "start-preview":
    case "release-preview":
      if (state === "interrupted") return refusal("transport.state_invalid");
      return receipt(state, false);
    case "replace-plan":
      return receipt("ready", true);
    case "dispose-transport":
      return receipt("disposed", true);
    default:
      return null;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rationalEquals(
  value: unknown,
  numerator: number,
  denominator: number,
): boolean {
  return (
    isRecord(value) &&
    value["numerator"] === numerator &&
    value["denominator"] === denominator
  );
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x === 0 ? 1 : x;
}

class Findings {
  readonly items: X1Finding[] = [];
  add(code: string, path: string, message: string): void {
    this.items.push(Object.freeze({ code, path, message }));
  }
  equal(actual: unknown, expected: unknown, code: string, path: string): void {
    const same =
      typeof expected === "object"
        ? JSON.stringify(actual) === JSON.stringify(expected)
        : Object.is(actual, expected);
    if (!same) {
      this.add(
        code,
        path,
        `expected ${JSON.stringify(expected)} but found ${JSON.stringify(actual)}`,
      );
    }
  }
}

async function loadFixture(
  name: string,
  overlay: Readonly<Record<string, unknown>> | undefined,
): Promise<{ value: unknown; bytes: Uint8Array | null }> {
  const path = resolve(FIXTURE_DIR, name);
  const raw = await readFile(path);
  const overlayValue = overlay?.[name];
  return {
    value: overlayValue === undefined ? JSON.parse(raw.toString("utf8")) : overlayValue,
    bytes: raw,
  };
}

function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === "" || !pointer.startsWith("/")) return undefined;
  let current: unknown = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else if (isRecord(current)) {
      if (!Object.hasOwn(current, token)) return undefined;
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

export function applyMutation(
  document: unknown,
  pointer: string,
  value: unknown,
): unknown {
  const clone = structuredClone(document);
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = clone;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index] ?? "";
    current = Array.isArray(current)
      ? current[Number(token)]
      : isRecord(current)
        ? current[token]
        : undefined;
  }
  const last = tokens[tokens.length - 1] ?? "";
  if (Array.isArray(current)) {
    current[Number(last)] = value;
  } else if (isRecord(current)) {
    current[last] = value;
  }
  return clone;
}

export async function validateX1Contract(
  overlay?: Readonly<Record<string, unknown>>,
): Promise<X1ValidationReport> {
  const findings = new Findings();
  const loaded = new Map<string, { value: unknown; bytes: Uint8Array | null }>();
  for (const name of X1_FIXTURE_FILES) {
    loaded.set(name, await loadFixture(name, overlay));
  }
  const manifest = loaded.get("x1-transport-contract.json")?.value;
  const matrix = loaded.get("state-machine-cases.json")?.value;
  const timing = loaded.get("golden-timing.json")?.value;
  const scheduler = loaded.get("scheduler-cases.json")?.value;
  const stop = loaded.get("stop-cases.json")?.value;
  const command = loaded.get("command-cases.json")?.value;
  const notification = loaded.get("notification-cases.json")?.value;
  const mutations = loaded.get("mutation-controls.json")?.value;
  const trace = loaded.get("trace-ledger.json")?.value;
  const provenance = loaded.get("provenance-ledger.json")?.value;
  if (
    !isRecord(manifest) || !isRecord(matrix) || !isRecord(timing) ||
    !isRecord(scheduler) || !isRecord(stop) || !isRecord(command) ||
    !isRecord(notification) || !isRecord(mutations) || !isRecord(trace) ||
    !isRecord(provenance)
  ) {
    findings.add("X1_SCHEMA", "/", "One or more fixture documents is not an object.");
    return report(findings, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  validateManifest(manifest, loaded, findings);
  const matrixCount = validateStateMatrix(matrix, findings);
  const timingCount = validateTiming(timing, findings);
  const schedulerCount = validateScheduler(scheduler, findings);
  const stopCount = validateStop(stop, findings);
  const commandCount = validateCommand(command, findings);
  const notificationCount = validateNotification(notification, findings);
  const universe = caseUniverse(matrixCount, timingCount, schedulerCount, stopCount, commandCount, notificationCount);
  const mutationCount = validateMutationControls(mutations, loaded, findings);
  const traceCount = validateTraces(trace, universe, mutationCount, findings);
  const authorityCount = validateProvenance(provenance, findings);

  return report(
    findings,
    matrixCount,
    timingCount,
    schedulerCount,
    stopCount,
    commandCount,
    notificationCount,
    traceCount,
    authorityCount,
    mutationCount,
  );
}

function report(
  findings: Findings,
  stateMatrixCases: number,
  timingGoldens: number,
  schedulerCases: number,
  stopCases: number,
  commandCases: number,
  notificationCases: number,
  traces: number,
  authorities: number,
  mutationControls: number,
): X1ValidationReport {
  return Object.freeze({
    schema: "changes.validation.x1-transport-contract.v1",
    outcome: findings.items.length === 0 ? "pass" : "fail",
    fixtureFiles: X1_FIXTURE_FILES.length,
    stateMatrixCases,
    timingGoldens,
    schedulerCases,
    stopCases,
    commandCases,
    notificationCases,
    traces,
    authorities,
    mutationControls,
    findings: Object.freeze([...findings.items]),
  });
}

function validateManifest(
  manifest: JsonRecord,
  loaded: ReadonlyMap<string, { value: unknown; bytes: Uint8Array | null }>,
  findings: Findings,
): void {
  findings.equal(manifest["schema"], "changes.fixtures.x1-transport-contract.v1", "X1_SCHEMA", "/schema");
  findings.equal(manifest["contractSchema"], "changes.audio.transport-contract.v1", "X1_SCHEMA", "/contractSchema");
  findings.equal(manifest["snapshotSchema"], "changes.audio.transport-snapshot.v1", "X1_SCHEMA", "/snapshotSchema");
  findings.equal(manifest["notificationSchema"], "changes.audio.transport-notification.v1", "X1_SCHEMA", "/notificationSchema");
  findings.equal(manifest["transportPolicyId"], "changes.audio-transport", "X1_SCHEMA", "/transportPolicyId");
  findings.equal(manifest["transportPolicyVersion"], 1, "X1_SCHEMA", "/transportPolicyVersion");
  findings.equal(manifest["schedulerPolicyId"], "changes.audio-transport-scheduler", "X1_SCHEMA", "/schedulerPolicyId");
  findings.equal(manifest["clickPolicyId"], "changes.audio-transport-click", "X1_SCHEMA", "/clickPolicyId");

  findings.equal(manifest["states"], [...STATES], "X1_STATES", "/states");
  findings.equal(manifest["commandKinds"], [...COMMAND_KINDS], "X1_STATES", "/commandKinds");
  findings.equal(manifest["notificationStatuses"], [...NOTIFICATION_STATUSES], "X1_STATES", "/notificationStatuses");
  findings.equal(manifest["workCounterNames"], [...WORK_COUNTERS], "X1_STATES", "/workCounterNames");
  findings.equal(manifest["generationBoundaries"], [...GENERATION_BOUNDARIES], "X1_STATES", "/generationBoundaries");

  findings.equal(manifest["stateStatusProjection"], { ...PROJECTION }, "X1_PROJECTION", "/stateStatusProjection");
  findings.equal(manifest["interruptedFailureCode"], "transport.interrupted", "X1_PROJECTION", "/interruptedFailureCode");

  findings.equal(manifest["refusalCodes"], [...REFUSAL_CODES], "X1_REFUSALS", "/refusalCodes");
  findings.equal(manifest["refusalPrecedence"], [...REFUSAL_PRECEDENCE], "X1_REFUSALS", "/refusalPrecedence");
  const precedence = (Array.isArray(manifest["refusalPrecedence"]) ? manifest["refusalPrecedence"] : [])
    .filter((value): value is string => typeof value === "string");
  if ([...precedence].sort().join("\n") !== [...REFUSAL_CODES].sort().join("\n")) {
    findings.add("X1_REFUSALS", "/refusalPrecedence", "Precedence must be a permutation of the refusal codes.");
  }

  const limits = isRecord(manifest["limits"]) ? manifest["limits"] : {};
  for (const [key, expected] of Object.entries(LIMITS)) {
    findings.equal(limits[key], expected, "X1_LIMITS", `/limits/${key}`);
  }
  const lookMax = limits["lookaheadSecondsMax"];
  const margin = limits["x0WindowMarginSeconds"];
  const window = limits["x0AttackWindowSeconds"];
  if (
    typeof lookMax === "number" && typeof margin === "number" &&
    typeof window === "number" && lookMax + margin !== window
  ) {
    findings.add("X1_LIMITS", "/limits/lookaheadSecondsMax", "lookaheadSecondsMax plus the margin must equal the X0 attack window.");
  }

  const click = isRecord(manifest["clickPolicy"]) ? manifest["clickPolicy"] : {};
  for (const [key, expected] of Object.entries(CLICK_POLICY)) {
    findings.equal(click[key], expected, "X1_LIMITS", `/clickPolicy/${key}`);
  }
  for (const key of ["accentVelocity", "beatVelocity"]) {
    const value = click[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 127) {
      findings.add("X1_LIMITS", `/clickPolicy/${key}`, "Click velocities must be integers 1-127.");
    }
  }
  if (
    typeof click["gateSeconds"] === "number" &&
    typeof limits["minAudioGateSeconds"] === "number" &&
    click["gateSeconds"] < limits["minAudioGateSeconds"]
  ) {
    findings.add("X1_LIMITS", "/clickPolicy/gateSeconds", "Click gate must be at or above the X0 gate floor.");
  }
  findings.equal(manifest["previewIdPrefix"], PREVIEW_ID_PREFIX, "X1_LIMITS", "/previewIdPrefix");

  const companions = records(manifest["companions"]);
  const expectedCompanions = X1_FIXTURE_FILES.filter((name) => name !== "x1-transport-contract.json");
  findings.equal(
    companions.map((companion) => companion["path"]),
    [...expectedCompanions],
    "X1_MANIFEST_COMPANION",
    "/companions",
  );
  for (const [index, companion] of companions.entries()) {
    const name = asString(companion["path"]);
    const bytes = loaded.get(name)?.bytes;
    if (bytes === null || bytes === undefined) continue;
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (companion["sha256"] !== digest) {
      findings.add("X1_MANIFEST_COMPANION", `/companions/${String(index)}/sha256`, `Companion digest mismatch for ${name}.`);
    }
    if (companion["bytes"] !== bytes.byteLength) {
      findings.add("X1_MANIFEST_COMPANION", `/companions/${String(index)}/bytes`, `Companion byte count mismatch for ${name}.`);
    }
  }
}

function validateStateMatrix(matrix: JsonRecord, findings: Findings): number {
  findings.equal(matrix["schema"], "changes.fixtures.x1-state-machine.v1", "X1_SCHEMA", "state-machine/schema");
  const cases = records(matrix["cases"]);
  findings.equal(matrix["stateCount"], STATES.length, "X1_STATE_MATRIX", "state-machine/stateCount");
  findings.equal(matrix["commandCount"], COMMAND_KINDS.length, "X1_STATE_MATRIX", "state-machine/commandCount");
  findings.equal(matrix["caseCount"], cases.length, "X1_STATE_MATRIX", "state-machine/caseCount");
  if (cases.length !== STATES.length * COMMAND_KINDS.length) {
    findings.add("X1_STATE_MATRIX", "state-machine/cases", `Expected ${String(STATES.length * COMMAND_KINDS.length)} cells, found ${String(cases.length)}.`);
  }
  const seen = new Set<string>();
  for (const [index, cell] of cases.entries()) {
    const path = `state-machine/cases/${String(index)}`;
    const id = asString(cell["caseId"]);
    if (!/^X1-SM-\d{3}$/u.test(id) || seen.has(id)) {
      findings.add("X1_STATE_MATRIX", path, `Invalid or duplicate case ID ${id}.`);
    }
    seen.add(id);
    const state = asString(cell["state"]);
    const command = asString(cell["command"]);
    const key = `${command}|${state}`;
    if (seen.has(key)) {
      findings.add("X1_STATE_MATRIX", path, `Duplicate cell ${key}.`);
    }
    seen.add(key);
    const expected = expectedCell(command, state);
    if (expected === null) {
      findings.add("X1_STATE_MATRIX", path, `Unknown command/state pair ${key}.`);
      continue;
    }
    if (expected.outcome === "receipt") {
      findings.equal(cell["outcome"], "receipt", "X1_STATE_MATRIX", `${path}/outcome`);
      findings.equal(cell["stateAfter"], expected.stateAfter, "X1_STATE_MATRIX", `${path}/stateAfter`);
      findings.equal(cell["generationBoundary"], expected.generationBoundary, "X1_STATE_MATRIX", `${path}/generationBoundary`);
    } else {
      findings.equal(cell["outcome"], "refusal", "X1_STATE_MATRIX", `${path}/outcome`);
      findings.equal(cell["refusalCode"], expected.refusalCode, "X1_STATE_MATRIX", `${path}/refusalCode`);
    }
  }
  return cases.length;
}

function validateTiming(timing: JsonRecord, findings: Findings): number {
  findings.equal(timing["schema"], "changes.fixtures.x1-golden-timing.v1", "X1_SCHEMA", "timing/schema");
  findings.equal(timing["ppq"], 960, "X1_TIMING_GOLDEN", "timing/ppq");
  findings.equal(timing["releaseGapTicks"], 24, "X1_TIMING_GOLDEN", "timing/releaseGapTicks");
  findings.equal(timing["tempiBpm"], [60, 120, 240], "X1_TIMING_GOLDEN", "timing/tempiBpm");
  const cases = records(timing["cases"]);
  const seen = new Set<string>();
  for (const [index, row] of cases.entries()) {
    const path = `timing/cases/${String(index)}`;
    const id = asString(row["caseId"]);
    if (!/^X1-TIME-\d{3}$/u.test(id) || seen.has(id)) {
      findings.add("X1_TIMING_GOLDEN", path, `Invalid or duplicate case ID ${id}.`);
    }
    seen.add(id);
    const tempo = row["tempoBpm"];
    if (tempo !== 60 && tempo !== 120 && tempo !== 240) {
      findings.add("X1_TIMING_GOLDEN", `${path}/tempoBpm`, "Tempo must be one of the reviewed tempi.");
      continue;
    }
    const duration = row["durationBeats"];
    const start = row["startBeat"];
    if (!isRecord(duration) || !isRecord(start)) {
      findings.add("X1_TIMING_GOLDEN", path, "Beats must be rational records.");
      continue;
    }
    const durationNumerator = Number(duration["numerator"]);
    const durationDenominator = Number(duration["denominator"]);
    const startNumerator = Number(start["numerator"]);
    const startDenominator = Number(start["denominator"]);
    const durationTicks = (durationNumerator * 960) / durationDenominator;
    if (!Number.isInteger(durationTicks) || durationTicks < 1) {
      findings.add("X1_TIMING_GOLDEN", `${path}/durationBeats`, "Duration must be a positive integer tick count at PPQ 960.");
      continue;
    }
    findings.equal(row["durationTicks"], durationTicks, "X1_TIMING_GOLDEN", `${path}/durationTicks`);
    const gateTicks = Math.max(durationTicks - 24, 1);
    findings.equal(row["gateTicks"], gateTicks, "X1_TIMING_GOLDEN", `${path}/gateTicks`);
    const divisor = greatestCommonDivisor(gateTicks, 960);
    if (!rationalEquals(row["gateBeats"], gateTicks / divisor, 960 / divisor)) {
      findings.add("X1_TIMING_GOLDEN", `${path}/gateBeats`, "Gate beats must be the reduced gateTicks/960 rational.");
    }
    findings.equal(row["startSeconds"], (startNumerator / startDenominator) * 60 / tempo, "X1_TIMING_GOLDEN", `${path}/startSeconds`);
    findings.equal(row["durationSeconds"], (durationNumerator / durationDenominator) * 60 / tempo, "X1_TIMING_GOLDEN", `${path}/durationSeconds`);
    const gateSeconds = (gateTicks / 960) * 60 / tempo;
    findings.equal(row["gateSeconds"], gateSeconds, "X1_TIMING_GOLDEN", `${path}/gateSeconds`);
    const floor = row["effectiveAudioGateSeconds"];
    if (gateSeconds < 0.005) {
      findings.equal(floor, 0.005, "X1_TIMING_GOLDEN", `${path}/effectiveAudioGateSeconds`);
    } else if (floor !== undefined) {
      findings.add("X1_TIMING_GOLDEN", `${path}/effectiveAudioGateSeconds`, "The audio floor may appear only below the X0 gate floor.");
    }
  }
  if (cases.length < 14) {
    findings.add("X1_TIMING_GOLDEN", "timing/cases", "Expected at least fourteen reviewed timing goldens.");
  }
  return cases.length;
}

function requireCase(
  cases: readonly JsonRecord[],
  id: string,
  findings: Findings,
  code: string,
): JsonRecord {
  const found = cases.find((row) => row["caseId"] === id);
  if (found === undefined) {
    findings.add(code, id, `Missing required case ${id}.`);
    return {};
  }
  return found;
}

function expected(row: JsonRecord): JsonRecord {
  return isRecord(row["expected"]) ? row["expected"] : {};
}

function validateScheduler(scheduler: JsonRecord, findings: Findings): number {
  findings.equal(scheduler["schema"], "changes.fixtures.x1-scheduler.v1", "X1_SCHEMA", "scheduler/schema");
  const cases = records(scheduler["cases"]);
  const code = "X1_SCHEDULER_CASES";
  const one = expected(requireCase(cases, "X1-SCHED-001", findings, code));
  findings.equal(one["attackBatchesIssued"], 1, code, "X1-SCHED-001/attackBatchesIssued");
  const two = expected(requireCase(cases, "X1-SCHED-002", findings, code));
  findings.equal(two["batchOrderByStartSeconds"], [0, 0.0625, 0.09375], code, "X1-SCHED-002/batchOrderByStartSeconds");
  const stale = expected(requireCase(cases, "X1-SCHED-003", findings, code));
  findings.equal(stale["attackBatchesIssued"], 0, code, "X1-SCHED-003/attackBatchesIssued");
  findings.equal(stale["staleCallbacksIgnoredDelta"], 1, code, "X1-SCHED-003/staleCallbacksIgnoredDelta");
  const wrap = expected(requireCase(cases, "X1-SCHED-004", findings, code));
  findings.equal(wrap["loopWrapsDelta"], 1, code, "X1-SCHED-004/loopWrapsDelta");
  findings.equal(wrap["generationDelta"], 1, code, "X1-SCHED-004/generationDelta");
  findings.equal(wrap["graphRecreated"], false, code, "X1-SCHED-004/graphRecreated");
  const margin = expected(requireCase(cases, "X1-SCHED-005", findings, code));
  findings.equal(margin["maxAttackLeadSeconds"], LIMITS.lookaheadSecondsMax, code, "X1-SCHED-005/maxAttackLeadSeconds");
  findings.equal(margin["x0WindowSeconds"], LIMITS.x0AttackWindowSeconds, code, "X1-SCHED-005/x0WindowSeconds");
  const reschedule = expected(requireCase(cases, "X1-SCHED-006", findings, code));
  findings.equal(reschedule["horizonReschedulesDelta"], 1, code, "X1-SCHED-006/horizonReschedulesDelta");
  findings.equal(reschedule["rescheduledEventCount"], 2, code, "X1-SCHED-006/rescheduledEventCount");
  findings.equal(reschedule["soundingVoicesRetired"], 0, code, "X1-SCHED-006/soundingVoicesRetired");
  const countIn = expected(requireCase(cases, "X1-SCHED-007", findings, code));
  findings.equal(countIn["clickEventsGeneratedDelta"], 4, code, "X1-SCHED-007/clickEventsGeneratedDelta");
  findings.equal(countIn["clickMidiPitches"], [88, 81, 81, 81], code, "X1-SCHED-007/clickMidiPitches");
  findings.equal(countIn["clickVelocities"], [112, 84, 84, 84], code, "X1-SCHED-007/clickVelocities");
  const clickIds = Array.isArray(countIn["clickEventIds"]) ? countIn["clickEventIds"] : [];
  if (!clickIds.every((id) => typeof id === "string" && id.startsWith(CLICK_POLICY.eventIdPrefix))) {
    findings.add(code, "X1-SCHED-007/clickEventIds", "Every click ID must use the reserved prefix.");
  }
  const metronome = expected(requireCase(cases, "X1-SCHED-008", findings, code));
  findings.equal(metronome["clickEventsGeneratedDelta"], 3, code, "X1-SCHED-008/clickEventsGeneratedDelta");
  findings.equal(metronome["clickMidiPitches"], [88, 81, 81], code, "X1-SCHED-008/clickMidiPitches");
  findings.equal(metronome["clickVelocities"], [112, 84, 84], code, "X1-SCHED-008/clickVelocities");
  const prefix = expected(requireCase(cases, "X1-SCHED-009", findings, code));
  findings.equal(prefix["reservedPrefix"], CLICK_POLICY.eventIdPrefix, code, "X1-SCHED-009/reservedPrefix");
  const idle = expected(requireCase(cases, "X1-SCHED-010", findings, code));
  findings.equal(idle["timerClearedAfterFinalGate"], true, code, "X1-SCHED-010/timerClearedAfterFinalGate");
  const empty = expected(requireCase(cases, "X1-SCHED-011", findings, code));
  findings.equal(empty["attackBatchesIssued"], 0, code, "X1-SCHED-011/attackBatchesIssued");
  findings.equal(empty["naturalEndsPublishedDelta"], 1, code, "X1-SCHED-011/naturalEndsPublishedDelta");
  const tempoMap = expected(requireCase(cases, "X1-SCHED-012", findings, code));
  if (!rationalEquals(tempoMap["anchorBeat"], 3, 2)) {
    findings.add(code, "X1-SCHED-012/anchorBeat", "The exact anchor beat must carry across the tempo epoch.");
  }
  findings.equal(tempoMap["oldSecondsPerBeat"], 0.5, code, "X1-SCHED-012/oldSecondsPerBeat");
  findings.equal(tempoMap["newSecondsPerBeat"], 1, code, "X1-SCHED-012/newSecondsPerBeat");
  findings.equal(tempoMap["soundingVoicesRetired"], 0, code, "X1-SCHED-012/soundingVoicesRetired");
  requireCase(cases, "X1-SCHED-013", findings, code);
  const frozen = expected(requireCase(cases, "X1-SCHED-014", findings, code));
  if (!rationalEquals(frozen["playheadAdvanceBeats"], 0, 1)) {
    findings.add(code, "X1-SCHED-014/playheadAdvanceBeats", "A suspended clock must advance zero beats.");
  }
  findings.equal(frozen["attackBatchesIssued"], 0, code, "X1-SCHED-014/attackBatchesIssued");
  return cases.length;
}

function validateStop(stop: JsonRecord, findings: Findings): number {
  findings.equal(stop["schema"], "changes.fixtures.x1-stop.v1", "X1_SCHEMA", "stop/schema");
  findings.equal(stop["stopOrder"], [...STOP_ORDER], "X1_STOP_CASES", "stop/stopOrder");
  const cases = records(stop["cases"]);
  const code = "X1_STOP_CASES";
  const postcondition = expected(requireCase(cases, "X1-STOP-001", findings, code));
  findings.equal(postcondition["noFutureAttackPostcondition"], true, code, "X1-STOP-001/noFutureAttackPostcondition");
  findings.equal(postcondition["playheadAfter"], "startBeat", code, "X1-STOP-001/playheadAfter");
  findings.equal(postcondition["notificationStatus"], "ready", code, "X1-STOP-001/notificationStatus");
  const stress = requireCase(cases, "X1-STOP-002", findings, code);
  findings.equal(stress["cycles"], 100, code, "X1-STOP-002/cycles");
  const stressExpected = expected(stress);
  findings.equal(stressExpected["graphRecreated"], false, code, "X1-STOP-002/graphRecreated");
  findings.equal(stressExpected["finalRegistryVoiceCount"], 0, code, "X1-STOP-002/finalRegistryVoiceCount");
  findings.equal(stressExpected["postStopAttacks"], 0, code, "X1-STOP-002/postStopAttacks");
  findings.equal(stressExpected["duplicateRetirements"], 0, code, "X1-STOP-002/duplicateRetirements");
  const both = expected(requireCase(cases, "X1-STOP-003", findings, code));
  findings.equal(both["progressionRetired"], true, code, "X1-STOP-003/progressionRetired");
  findings.equal(both["previewRetired"], true, code, "X1-STOP-003/previewRetired");
  findings.equal(both["stopReleaseSeconds"], LIMITS.stopReleaseSeconds, code, "X1-STOP-003/stopReleaseSeconds");
  const previewOnly = expected(requireCase(cases, "X1-STOP-004", findings, code));
  findings.equal(previewOnly["progressionRetired"], false, code, "X1-STOP-004/progressionRetired");
  findings.equal(previewOnly["playheadChanged"], false, code, "X1-STOP-004/playheadChanged");
  findings.equal(previewOnly["notificationPublished"], false, code, "X1-STOP-004/notificationPublished");
  const natural = expected(requireCase(cases, "X1-STOP-005", findings, code));
  findings.equal(natural["forcedRampApplied"], false, code, "X1-STOP-005/forcedRampApplied");
  findings.equal(natural["notificationStatus"], "ready", code, "X1-STOP-005/notificationStatus");
  findings.equal(natural["playheadAfter"], "startBeat", code, "X1-STOP-005/playheadAfter");
  findings.equal(natural["tailDeadlineSeconds"], LIMITS.naturalEndTailDeadlineSeconds, code, "X1-STOP-005/tailDeadlineSeconds");
  findings.equal(natural["registryEmptyByDeadline"], true, code, "X1-STOP-005/registryEmptyByDeadline");
  const replay = expected(requireCase(cases, "X1-STOP-006", findings, code));
  findings.equal(replay["oldGenerationRetiredFirst"], true, code, "X1-STOP-006/oldGenerationRetiredFirst");
  findings.equal(replay["graphRecreated"], false, code, "X1-STOP-006/graphRecreated");
  const interruption = expected(requireCase(cases, "X1-STOP-007", findings, code));
  findings.equal(interruption["stateAfter"], "interrupted", code, "X1-STOP-007/stateAfter");
  findings.equal(interruption["notificationStatus"], "paused", code, "X1-STOP-007/notificationStatus");
  findings.equal(interruption["failureCode"], "transport.interrupted", code, "X1-STOP-007/failureCode");
  if (!rationalEquals(interruption["storedBeat"], 5, 4)) {
    findings.add(code, "X1-STOP-007/storedBeat", "The stored beat must be the exact interruption beat.");
  }
  findings.equal(interruption["playheadAdvancedDuringSuspension"], false, code, "X1-STOP-007/playheadAdvancedDuringSuspension");
  const recovery = expected(requireCase(cases, "X1-STOP-008", findings, code));
  findings.equal(recovery["stateAfter"], "playing", code, "X1-STOP-008/stateAfter");
  if (!rationalEquals(recovery["resumeBeat"], 5, 4)) {
    findings.add(code, "X1-STOP-008/resumeBeat", "Recovery must resume from the stored exact beat.");
  }
  findings.equal(recovery["staleCallbackAttacks"], 0, code, "X1-STOP-008/staleCallbackAttacks");
  const replacement = expected(requireCase(cases, "X1-STOP-009", findings, code));
  findings.equal(replacement["retireBeforePublish"], true, code, "X1-STOP-009/retireBeforePublish");
  findings.equal(replacement["stateAfter"], "ready", code, "X1-STOP-009/stateAfter");
  findings.equal(replacement["noFutureAttackPostcondition"], true, code, "X1-STOP-009/noFutureAttackPostcondition");
  const emptied = expected(requireCase(cases, "X1-STOP-010", findings, code));
  findings.equal(emptied["stateAfter"], "ready", code, "X1-STOP-010/stateAfter");
  findings.equal(emptied["documentIdAfter"], null, code, "X1-STOP-010/documentIdAfter");
  findings.equal(emptied["continuationWithoutBindingRefusal"], "transport.plan_mismatch", code, "X1-STOP-010/continuationWithoutBindingRefusal");
  const dispose = expected(requireCase(cases, "X1-STOP-011", findings, code));
  findings.equal(dispose["stateAfter"], "disposed", code, "X1-STOP-011/stateAfter");
  findings.equal(dispose["secondDisposeRefusal"], "transport.disposed", code, "X1-STOP-011/secondDisposeRefusal");
  findings.equal(dispose["timerCleared"], true, code, "X1-STOP-011/timerCleared");
  const fault = expected(requireCase(cases, "X1-STOP-012", findings, code));
  findings.equal(fault["stateAfter"], "fault", code, "X1-STOP-012/stateAfter");
  findings.equal(fault["notificationStatus"], "failed", code, "X1-STOP-012/notificationStatus");
  return cases.length;
}

function validateCommand(command: JsonRecord, findings: Findings): number {
  findings.equal(command["schema"], "changes.fixtures.x1-command.v1", "X1_SCHEMA", "command/schema");
  const cases = records(command["cases"]);
  const code = "X1_COMMAND_CASES";
  const refusalCodeSet = new Set<string>(REFUSAL_CODES);
  for (const [index, row] of cases.entries()) {
    const declared = expected(row)["refusalCode"];
    if (typeof declared === "string" && !refusalCodeSet.has(declared)) {
      findings.add(code, `command/cases/${String(index)}/refusalCode`, `Unknown refusal code ${declared}.`);
    }
  }
  findings.equal(expected(requireCase(cases, "X1-CMD-001", findings, code))["refusalCode"], "transport.command_request_id_invalid", code, "X1-CMD-001/refusalCode");
  findings.equal(expected(requireCase(cases, "X1-CMD-002", findings, code))["refusalCode"], "transport.command_request_id_invalid", code, "X1-CMD-002/refusalCode");
  const overflow = requireCase(cases, "X1-CMD-003", findings, code);
  findings.equal(overflow["queuedCommands"], LIMITS.maxQueuedCommands, code, "X1-CMD-003/queuedCommands");
  findings.equal(expected(overflow)["refusalCode"], "transport.queue_overflow", code, "X1-CMD-003/refusalCode");
  findings.equal(expected(overflow)["queueAfter"], LIMITS.maxQueuedCommands, code, "X1-CMD-003/queueAfter");
  const timingRows = requireCase(cases, "X1-CMD-004", findings, code);
  findings.equal(expected(timingRows)["refusalCode"], "transport.timing_policy_invalid", code, "X1-CMD-004/refusalCode");
  for (const [index, row] of records(timingRows["invalidTimings"]).entries()) {
    const tick = Number(row["tickIntervalMs"]);
    const lookahead = Number(row["lookaheadSeconds"]);
    const violates =
      tick < LIMITS.tickIntervalMsMin ||
      tick > LIMITS.tickIntervalMsMax ||
      lookahead < LIMITS.lookaheadSecondsMin ||
      lookahead > LIMITS.lookaheadSecondsMax ||
      !(lookahead * 1000 > tick);
    if (!violates) {
      findings.add(code, `X1-CMD-004/invalidTimings/${String(index)}`, "A declared invalid timing row does not violate any bound.");
    }
  }
  findings.equal(expected(requireCase(cases, "X1-CMD-005", findings, code))["refusalCode"], "transport.gesture_invalid", code, "X1-CMD-005/refusalCode");
  findings.equal(expected(requireCase(cases, "X1-CMD-006", findings, code))["refusalCode"], "transport.start_beat_out_of_range", code, "X1-CMD-006/refusalCode");
  const seek = expected(requireCase(cases, "X1-CMD-007", findings, code));
  findings.equal(seek["pausedSeekStaysPaused"], true, code, "X1-CMD-007/pausedSeekStaysPaused");
  findings.equal(seek["playingSeekResumesAtTarget"], true, code, "X1-CMD-007/playingSeekResumesAtTarget");
  findings.equal(seek["outOfRangeRefusal"], "transport.seek_out_of_range", code, "X1-CMD-007/outOfRangeRefusal");
  findings.equal(expected(requireCase(cases, "X1-CMD-008", findings, code))["refusalCode"], "transport.plan_mismatch", code, "X1-CMD-008/refusalCode");
  const tempo = requireCase(cases, "X1-CMD-009", findings, code);
  findings.equal(expected(tempo)["refusalCode"], "transport.tempo_out_of_range", code, "X1-CMD-009/refusalCode");
  for (const value of Array.isArray(tempo["invalidTempi"]) ? tempo["invalidTempi"] : []) {
    if (typeof value === "number" && value >= LIMITS.tempoBpmMin && value <= LIMITS.tempoBpmMax) {
      findings.add(code, "X1-CMD-009/invalidTempi", `${String(value)} lies inside the legal tempo range.`);
    }
  }
  findings.equal(expected(requireCase(cases, "X1-CMD-010", findings, code))["refusalCode"], "transport.plan_mismatch", code, "X1-CMD-010/refusalCode");
  findings.equal(expected(requireCase(cases, "X1-CMD-011", findings, code))["refusalCode"], "transport.loop_invalid", code, "X1-CMD-011/refusalCode");
  const instrument = requireCase(cases, "X1-CMD-012", findings, code);
  findings.equal(expected(instrument)["refusalCode"], "transport.instrument_unknown", code, "X1-CMD-012/refusalCode");
  const legal = new Set<string>(INSTRUMENT_IDS);
  for (const value of Array.isArray(instrument["invalidInstrumentIds"]) ? instrument["invalidInstrumentIds"] : []) {
    if (typeof value === "string" && legal.has(value)) {
      findings.add(code, "X1-CMD-012/invalidInstrumentIds", `${value} is a legal instrument ID.`);
    }
  }
  findings.equal(expected(requireCase(cases, "X1-CMD-013", findings, code))["refusalCode"], "transport.preview_invalid", code, "X1-CMD-013/refusalCode");
  const previewSwap = expected(requireCase(cases, "X1-CMD-014", findings, code));
  findings.equal(previewSwap["previewAReleasedBeforeBAttack"], true, code, "X1-CMD-014/previewAReleasedBeforeBAttack");
  findings.equal(previewSwap["previewReleaseSeconds"], LIMITS.previewReleaseSeconds, code, "X1-CMD-014/previewReleaseSeconds");
  findings.equal(previewSwap["progressionTouched"], false, code, "X1-CMD-014/progressionTouched");
  findings.equal(expected(requireCase(cases, "X1-CMD-015", findings, code))["refusalCode"], "transport.preview_invalid", code, "X1-CMD-015/refusalCode");
  const engine = expected(requireCase(cases, "X1-CMD-016", findings, code));
  findings.equal(engine["refusalCode"], "transport.engine_refusal", code, "X1-CMD-016/refusalCode");
  const engineCode = engine["engineRefusalCode"];
  if (typeof engineCode !== "string" || !X0_REFUSAL_CODES_PINNED.includes(engineCode as (typeof X0_REFUSAL_CODES_PINNED)[number])) {
    findings.add(code, "X1-CMD-016/engineRefusalCode", "The carried engine code must be a pinned X0 v1 refusal code.");
  }
  const toggles = expected(requireCase(cases, "X1-CMD-017", findings, code));
  findings.equal(toggles["refusalCodes"], ["transport.count_in_invalid", "transport.metronome_invalid"], code, "X1-CMD-017/refusalCodes");
  findings.equal(expected(requireCase(cases, "X1-CMD-018", findings, code))["refusalCode"], "transport.plan_mismatch", code, "X1-CMD-018/refusalCode");
  findings.equal(expected(requireCase(cases, "X1-CMD-019", findings, code))["refusalCode"], "transport.plan_invalid", code, "X1-CMD-019/refusalCode");
  const serialized = expected(requireCase(cases, "X1-CMD-020", findings, code));
  findings.equal(serialized["executionOrder"], ["play", "pause", "stop"], code, "X1-CMD-020/executionOrder");
  findings.equal(serialized["overlappingTransitions"], 0, code, "X1-CMD-020/overlappingTransitions");
  findings.equal(serialized["finalState"], "ready", code, "X1-CMD-020/finalState");
  if (cases.length !== 20) {
    findings.add(code, "command/cases", `Expected twenty command cases, found ${String(cases.length)}.`);
  }
  return cases.length;
}

function validateNotification(notification: JsonRecord, findings: Findings): number {
  findings.equal(notification["schema"], "changes.fixtures.x1-notification.v1", "X1_SCHEMA", "notification/schema");
  const code = "X1_NOTIFICATION_CASES";
  findings.equal(notification["stateStatusProjection"], { ...PROJECTION }, code, "notification/stateStatusProjection");
  findings.equal(notification["silentStates"], ["locked", "disposed"], code, "notification/silentStates");
  findings.equal(notification["interruptedFailureCode"], "transport.interrupted", code, "notification/interruptedFailureCode");
  const cases = records(notification["cases"]);
  const lifecycle = expected(requireCase(cases, "X1-VIEW-001", findings, code));
  findings.equal(lifecycle["statusSequence"], ["ready", "playing", "paused", "playing", "ready"], code, "X1-VIEW-001/statusSequence");
  findings.equal(lifecycle["notificationCount"], 5, code, "X1-VIEW-001/notificationCount");
  requireCase(cases, "X1-VIEW-002", findings, code);
  findings.equal(expected(requireCase(cases, "X1-VIEW-003", findings, code))["applicationOutcome"], "ignored-stale", code, "X1-VIEW-003/applicationOutcome");
  const interrupted = expected(requireCase(cases, "X1-VIEW-004", findings, code));
  findings.equal(interrupted["status"], "paused", code, "X1-VIEW-004/status");
  findings.equal(interrupted["failureCode"], "transport.interrupted", code, "X1-VIEW-004/failureCode");
  const fault = expected(requireCase(cases, "X1-VIEW-005", findings, code));
  findings.equal(fault["status"], "failed", code, "X1-VIEW-005/status");
  findings.equal(fault["notificationCount"], 1, code, "X1-VIEW-005/notificationCount");
  const rebind = expected(requireCase(cases, "X1-VIEW-006", findings, code));
  findings.equal(rebind["status"], "ready", code, "X1-VIEW-006/status");
  const playhead = expected(requireCase(cases, "X1-VIEW-007", findings, code));
  if (!rationalEquals(playhead["playhead"], 7, 3)) {
    findings.add(code, "X1-VIEW-007/playhead", "The notification playhead must be the exact rational beat.");
  }
  findings.equal(expected(requireCase(cases, "X1-VIEW-008", findings, code))["refusalOrFaultCode"], "transport.internal_sequence_exhausted", code, "X1-VIEW-008/refusalOrFaultCode");
  const statuses = new Set<string>(NOTIFICATION_STATUSES);
  for (const [index, row] of cases.entries()) {
    const status = expected(row)["status"];
    if (typeof status === "string" && !statuses.has(status)) {
      findings.add(code, `notification/cases/${String(index)}/status`, `Unknown notification status ${status}.`);
    }
  }
  return cases.length;
}

function caseUniverse(
  matrixCount: number,
  timingCount: number,
  schedulerCount: number,
  stopCount: number,
  commandCount: number,
  notificationCount: number,
): ReadonlySet<string> {
  const universe = new Set<string>();
  const families: readonly [string, number][] = [
    ["X1-SM", matrixCount],
    ["X1-TIME", timingCount],
    ["X1-SCHED", schedulerCount],
    ["X1-STOP", stopCount],
    ["X1-CMD", commandCount],
    ["X1-VIEW", notificationCount],
  ];
  for (const [prefix, count] of families) {
    for (let index = 1; index <= count; index += 1) {
      universe.add(`${prefix}-${String(index).padStart(3, "0")}`);
    }
  }
  return universe;
}

function validateMutationControls(
  mutations: JsonRecord,
  loaded: ReadonlyMap<string, { value: unknown; bytes: Uint8Array | null }>,
  findings: Findings,
): number {
  findings.equal(mutations["schema"], "changes.fixtures.x1-mutation-controls.v1", "X1_SCHEMA", "mutations/schema");
  findings.equal(mutations["productionImportsForbidden"], true, "X1_MUTATION_CONTROLS", "mutations/productionImportsForbidden");
  const controls = records(mutations["controls"]);
  const code = "X1_MUTATION_CONTROLS";
  if (controls.length !== 30) {
    findings.add(code, "mutations/controls", `Expected thirty controls, found ${String(controls.length)}.`);
  }
  const codes = new Set<string>(FINDING_CODES);
  const files = new Set<string>(X1_FIXTURE_FILES);
  const ids = new Set<string>();
  for (const [index, control] of controls.entries()) {
    const path = `mutations/controls/${String(index)}`;
    const id = asString(control["id"]);
    if (!/^X1-MUT-\d{3}$/u.test(id) || ids.has(id)) {
      findings.add(code, path, `Invalid or duplicate control ID ${id}.`);
    }
    ids.add(id);
    const file = asString(control["file"]);
    if (!files.has(file)) {
      findings.add(code, `${path}/file`, `Unknown target file ${file}.`);
      continue;
    }
    if (!codes.has(asString(control["expectedFindingCode"]))) {
      findings.add(code, `${path}/expectedFindingCode`, "Unknown expected finding code.");
    }
    findings.equal(control["operation"], "replace", code, `${path}/operation`);
    const target = loaded.get(file)?.value;
    const pointer = asString(control["pointer"]);
    const current = resolvePointer(target, pointer);
    if (current === undefined) {
      findings.add(code, `${path}/pointer`, `Pointer ${pointer} does not resolve in ${file}.`);
    } else if (JSON.stringify(current) === JSON.stringify(control["value"])) {
      findings.add(code, `${path}/value`, "The mutation value equals the current value and cannot change behavior.");
    }
  }
  return controls.length;
}

function validateTraces(
  trace: JsonRecord,
  universe: ReadonlySet<string>,
  mutationCount: number,
  findings: Findings,
): number {
  findings.equal(trace["schema"], "changes.fixtures.x1-trace-ledger.v1", "X1_SCHEMA", "trace/schema");
  const traces = records(trace["traces"]);
  const code = "X1_TRACE";
  const ids = new Set<string>();
  const coveredCases = new Set<string>();
  const coveredControls = new Set<string>();
  const controlIds = new Set<string>(
    Array.from({ length: mutationCount }, (_, index) => `X1-MUT-${String(index + 1).padStart(3, "0")}`),
  );
  for (const [index, entry] of traces.entries()) {
    const path = `trace/traces/${String(index)}`;
    const id = asString(entry["id"]);
    if (id.length === 0 || ids.has(id)) {
      findings.add(code, path, `Invalid or duplicate trace ID ${id}.`);
    }
    ids.add(id);
    const caseIds = Array.isArray(entry["caseIds"]) ? entry["caseIds"] : [];
    if (caseIds.length === 0) {
      findings.add(code, `${path}/caseIds`, "Every trace must name at least one case.");
    }
    for (const caseId of caseIds) {
      if (typeof caseId !== "string" || !universe.has(caseId)) {
        findings.add(code, `${path}/caseIds`, `Unknown case ${String(caseId)}.`);
      } else {
        coveredCases.add(caseId);
      }
    }
    for (const controlId of Array.isArray(entry["controlIds"]) ? entry["controlIds"] : []) {
      if (typeof controlId !== "string" || !controlIds.has(controlId)) {
        findings.add(code, `${path}/controlIds`, `Unknown control ${String(controlId)}.`);
      } else {
        coveredControls.add(controlId);
      }
    }
    if (asString(entry["evidenceOwner"]).length === 0) {
      findings.add(code, `${path}/evidenceOwner`, "Every trace needs an evidence owner.");
    }
    if (asString(entry["requirement"]).length === 0 || asString(entry["parentSource"]).length === 0) {
      findings.add(code, path, "Every trace needs a requirement and parent source.");
    }
    if (id === "TR-X1-LISTENING" && entry["evidenceOwner"] !== "release-evidence/audio/listening") {
      findings.add(code, `${path}/evidenceOwner`, "The listening trace is owned by the human listening directory.");
    }
  }
  for (const required of REQUIRED_TRACE_IDS) {
    if (!ids.has(required)) {
      findings.add(code, "trace/traces", `Missing required trace ${required}.`);
    }
  }
  for (const caseId of universe) {
    if (!coveredCases.has(caseId)) {
      findings.add(code, "trace/traces", `Case ${caseId} belongs to no trace.`);
    }
  }
  for (const controlId of controlIds) {
    if (!coveredControls.has(controlId)) {
      findings.add(code, "trace/traces", `Control ${controlId} belongs to no trace.`);
    }
  }
  return traces.length;
}

function validateProvenance(provenance: JsonRecord, findings: Findings): number {
  findings.equal(provenance["schema"], "changes.fixtures.x1-provenance-ledger.v1", "X1_SCHEMA", "provenance/schema");
  const code = "X1_PROVENANCE";
  findings.equal(provenance["reviewState"], "reviewed-for-x1-spec", code, "provenance/reviewState");
  findings.equal(provenance["expectedValuesGenerated"], false, code, "provenance/expectedValuesGenerated");
  findings.equal(provenance["productionOutputUsed"], false, code, "provenance/productionOutputUsed");
  const policy = isRecord(provenance["classificationPolicy"]) ? provenance["classificationPolicy"] : {};
  const classes = new Set(Object.keys(policy));
  const authorities = records(provenance["authorities"]);
  const ids = new Set<string>();
  for (const [index, authority] of authorities.entries()) {
    const path = `provenance/authorities/${String(index)}`;
    const id = asString(authority["id"]);
    if (id.length === 0 || ids.has(id)) {
      findings.add(code, path, `Invalid or duplicate authority ID ${id}.`);
    }
    ids.add(id);
    if (!classes.has(asString(authority["class"]))) {
      findings.add(code, `${path}/class`, "Authority class must come from the classification policy.");
    }
    if (asString(authority["source"]).length === 0) {
      findings.add(code, `${path}/source`, "Every authority needs a source.");
    }
    const supports = Array.isArray(authority["supports"]) ? authority["supports"] : [];
    if (supports.length === 0) {
      findings.add(code, `${path}/supports`, "Every authority must support at least one expectation.");
    }
  }
  for (const required of REQUIRED_AUTHORITY_IDS) {
    if (!ids.has(required)) {
      findings.add(code, "provenance/authorities", `Missing required authority ${required}.`);
    }
  }
  return authorities.length;
}

async function main(): Promise<void> {
  const result = await validateX1Contract();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
