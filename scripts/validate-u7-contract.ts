/**
 * Independent validator for the proposed U7 MIDI-export-workflow packet.
 *
 * This validator imports no production module. It restates every constant it
 * judges (the U7_REVIEWED_* exports below), re-derives every preview
 * expectation from the fixture scenarios with its own minimal SMF emitter and
 * derivation-law implementations, replays every mutation control, and pins
 * the frozen packet with two-layer digests. The production U7 implementation,
 * when it exists, is judged by these fixtures; it may never generate them.
 *
 * CLI: bun scripts/validate-u7-contract.ts [fixtureRoot] [--allow-pending-freeze]
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

/* -------------------------------------------------------------------------- */
/* Restated reviewed constants (bound to the source module by the static test) */
/* -------------------------------------------------------------------------- */

export const U7_REVIEWED_CONTRACT_SCHEMA =
  "changes.application.u7-midi-export-workflow-contract.v1";
export const U7_REVIEWED_MANIFEST_SCHEMA =
  "changes.fixtures.u7-midi-export-workflow-contract.v1";
export const U7_REVIEWED_PACKAGE = "U7";
export const U7_REVIEWED_BEAD_ID = "jcpe-milestone-advanced-craft-ulj.11.1";
export const U7_REVIEWED_POLICY_ID = "changes.u7-midi-export-workflow";
export const U7_REVIEWED_POLICY_VERSION = 1;

export const U7_REVIEWED_WORKFLOW_STATES = Object.freeze([
  "idle",
  "preview-open",
  "generating",
  "ready",
  "delivering",
  "delivered",
] as const);

export const U7_REVIEWED_WORKFLOW_ACTIONS = Object.freeze([
  "open",
  "close",
  "cancel",
  "generate",
  "download",
  "re-preview",
  "dismiss-delivered",
] as const);

export const U7_REVIEWED_CANCELABLE_STATES = Object.freeze([
  "preview-open",
  "generating",
  "ready",
] as const);

export const U7_REVIEWED_REGISTRY_STATES = Object.freeze([
  "empty",
  "preparing",
  "ready",
  "delivering",
] as const);

export const U7_REVIEWED_REFUSAL_CODES = Object.freeze([
  "u7.request_invalid",
  "u7.document_unavailable",
  "u7.hash_unavailable",
  "u7.preparation_conflict",
  "u7.preparation_missing",
  "u7.delivery_cleanup_failed",
  "limit.u7_preview_work_exceeded",
] as const);

export const U7_REVIEWED_STALE_OUTCOME_CODE = "u7.revision_stale";

export const U7_REVIEWED_BLOCKER_KINDS = Object.freeze([
  "realization",
  "plan",
  "export",
  "empty-chart",
] as const);

export const U7_REVIEWED_OMISSION_REASONS = Object.freeze([
  "text-control-chars",
  "text-over-limit",
  "text-empty",
  "format-refused",
] as const);

export const U7_REVIEWED_TITLE_NOTICE_KINDS = Object.freeze([
  "title-control-chars-substituted",
  "title-truncated",
] as const);

export const U7_REVIEWED_DELIVERY_OUTCOMES = Object.freeze([
  "handed-off",
  "failed",
  "cleanup-failed",
] as const);

export const U7_REVIEWED_ANNOUNCEMENT_KEYS = Object.freeze([
  "u7.announce.preview_ready",
  "u7.announce.preview_blocked",
  "u7.announce.generating",
  "u7.announce.ready",
  "u7.announce.stale",
  "u7.announce.delivering",
  "u7.announce.handed_off",
  "u7.announce.delivery_failed",
  "u7.announce.cleanup_failed",
  "u7.announce.cancelled",
  "u7.announce.closed",
] as const);

export const U7_REVIEWED_LAW_IDS = Object.freeze([
  "U7-LAW-PREVIEW-BINDING",
  "U7-LAW-DERIVATION-MARKER",
  "U7-LAW-DERIVATION-TITLE",
  "U7-LAW-DERIVATION-REQUEST-ID",
  "U7-LAW-REALIZATION-SUMMARY",
  "U7-LAW-BLOCKED-ENUMERATION",
  "U7-LAW-LOSS-MIRROR",
  "U7-LAW-ARTIFACT-HASH",
  "U7-LAW-DETERMINISTIC-BYTES",
  "U7-LAW-STATE-MACHINE",
  "U7-LAW-REGISTRY-DISCIPLINE",
  "U7-LAW-DELIVERY-CLEANUP",
  "U7-LAW-NO-EXPORT-MARKER",
  "U7-LAW-NO-RECOVERY-SAVE",
  "U7-LAW-NO-VOICING-REPAIR",
  "U7-LAW-ACCESSIBILITY-MATRIX",
  "U7-LAW-WORK-BOUND",
] as const);

export const U7_REVIEWED_COMPONENTS = Object.freeze([
  { id: "U7-CMP-001", name: "MidiExportTrigger", surface: "header" },
  { id: "U7-CMP-002", name: "MidiExportDialog", surface: "dialog" },
  { id: "U7-CMP-003", name: "MidiExportSheet", surface: "sheet" },
  { id: "U7-CMP-004", name: "MidiExportReadinessSummary", surface: "shared" },
  { id: "U7-CMP-005", name: "MidiExportDisclosureList", surface: "shared" },
  { id: "U7-CMP-006", name: "MidiExportBlockedList", surface: "shared" },
  { id: "U7-CMP-007", name: "MidiExportBlockedEventLink", surface: "shared" },
  { id: "U7-CMP-008", name: "MidiExportArtifactSummary", surface: "shared" },
  { id: "U7-CMP-009", name: "MidiExportGenerateButton", surface: "shared" },
  { id: "U7-CMP-010", name: "MidiExportDownloadButton", surface: "shared" },
  { id: "U7-CMP-011", name: "MidiExportCancelButton", surface: "shared" },
  { id: "U7-CMP-012", name: "MidiExportStatusRegion", surface: "shared" },
] as const);

export const U7_REVIEWED_LIMITS = Object.freeze({
  maxChordEvents: 8_192,
  maxSections: 64,
  maxMarkers: 8_256,
  maxMarkerTextUtf8Bytes: 96,
  maxArtifactBytes: 4_194_304,
  maxFilenameCharacters: 64,
  maxRequestIdAsciiLength: 128,
  minPreparationId: 1,
  maxPreparationId: 9_007_199_254_740_991,
  compactBreakpointCssPx: 640,
} as const);

export const U7_REVIEWED_DERIVATION_PINS = Object.freeze({
  markerAccidentalStyle: "unicode",
  titleFallback: "Untitled",
  voicingTrackName: "Voicings",
  instrumentName: "Changes",
  requestIdPrefix: "u7-midi-export-",
  customChordPlanCode: "playback.custom_voicing_missing",
} as const);

export const U7_REVIEWED_EXISTING_DIALOG_KINDS = Object.freeze([
  "new-document",
  "lesson-load",
  "import-confirm",
  "discard-changes",
  "history-limit",
  "error-details",
] as const);
export const U7_REVIEWED_PROPOSED_DIALOG_KIND = "midi-export";

export const U7_REVIEWED_COMPANIONS = Object.freeze([
  "preview-cases.json",
  "state-cases.json",
  "limit-cases.json",
  "trace-ledger.json",
  "provenance-ledger.json",
  "mutation-controls.json",
] as const);

export const U7_REVIEWED_COMPANION_SCHEMAS = Object.freeze({
  "preview-cases.json":
    "changes.fixtures.u7-midi-export-workflow-preview-cases.v1",
  "state-cases.json":
    "changes.fixtures.u7-midi-export-workflow-state-cases.v1",
  "limit-cases.json":
    "changes.fixtures.u7-midi-export-workflow-limit-cases.v1",
  "trace-ledger.json":
    "changes.fixtures.u7-midi-export-workflow-trace-ledger.v1",
  "provenance-ledger.json":
    "changes.fixtures.u7-midi-export-workflow-provenance-ledger.v1",
  "mutation-controls.json":
    "changes.fixtures.u7-midi-export-workflow-mutation-controls.v1",
} as const);

/* Frozen at the freeze commit; empty during pending-validator-freeze. */
export const U7_REVIEWED_BYTE_DIGESTS: Readonly<Record<string, string>> =
  Object.freeze({
    "preview-cases.json":
      "d666c733aed6a9316e1c915a4df00fba735253885deba41f9f460fa0e3237dac",
    "state-cases.json":
      "8a61316b520f862cea857c3cb5c1727d04784f56bee70c2e9cc174d6625b01e3",
    "limit-cases.json":
      "aaaee0bb3bcdbfe7dc163c2128a432d435a86beb5f54b696081e6bba1666c8bc",
    "trace-ledger.json":
      "5bd74f3cffdf950413dd541237658b11fdb149f52149cefc130a6d17e03a083f",
    "provenance-ledger.json":
      "8f1c31991b97478faea0ea237e81425be8eb113fd67c41c2cf96445f43103848",
    "mutation-controls.json":
      "6688ac81c434ceeb764e3dca25662727d0466f5225ef0c9cb6af633c3ada9ddf",
  });

export const U7_REVIEWED_SEMANTIC_DIGEST =
  "1042e6ea5320672d9d99840baa24da88c214e9a4f6340a9efea8dcbc87004afe";

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

type JsonObject = Record<string, unknown>;

export type U7ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

function finding(code: string, path: string, message: string): U7ContractFinding {
  return Object.freeze({ code, path, message });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256HexBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Canonical JSON: sorted keys, no whitespace, arrays in order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  if (value === undefined) return "null";
  return JSON.stringify(value);
}

/** Raw-text duplicate-key scan, including escaped-key attacks. */
function duplicateJsonKeys(raw: string): string[] {
  const duplicates: string[] = [];
  const stack: { keys: Set<string> }[] = [];
  let i = 0;
  const n = raw.length;
  const parseString = (): string => {
    let out = "";
    i += 1;
    while (i < n) {
      const ch = raw[i];
      if (ch === "\\") {
        const esc = raw[i + 1] ?? "";
        if (esc === "u") {
          out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        const map: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        out += map[esc] ?? esc;
        i += 2;
        continue;
      }
      if (ch === '"') {
        i += 1;
        return out;
      }
      out += ch ?? "";
      i += 1;
    }
    return out;
  };
  const skipValue = (): void => {
    let depth = 0;
    let inString = false;
    while (i < n) {
      const ch = raw[i];
      if (inString) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === '"') inString = false;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inString = true;
        i += 1;
        continue;
      }
      if (ch === "{" || ch === "[") {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === "}" || ch === "]") {
        if (depth === 0) return;
        depth -= 1;
        i += 1;
        if (depth === 0) return;
        continue;
      }
      if (depth === 0 && ch === ",") return;
      i += 1;
    }
  };
  const walkObject = (): void => {
    const frame = { keys: new Set<string>() };
    stack.push(frame);
    i += 1; // consume {
    let expectKey = true;
    while (i < n) {
      const ch = raw[i];
      if (ch === "}") {
        i += 1;
        stack.pop();
        return;
      }
      if (expectKey) {
        if (ch === '"') {
          const key = parseString();
          if (frame.keys.has(key)) duplicates.push(key);
          frame.keys.add(key);
          expectKey = false;
        } else {
          i += 1;
        }
        continue;
      }
      if (ch === ":") {
        i += 1;
        // consume the value, recursing into nested objects
        while (i < n && /\s/.test(raw[i] ?? "")) i += 1;
        if (raw[i] === "{") {
          walkObject();
        } else if (raw[i] === "[") {
          // walk array elements for nested objects
          i += 1;
          let depth = 1;
          while (i < n && depth > 0) {
            const c = raw[i];
            if (c === "{") {
              walkObject();
              depth -= 0; // object consumed; array depth unchanged by walkObject
              // walkObject consumed exactly one object
              // adjust: array depth is managed manually here
              // fallthrough handled by depth accounting below
            }
            if (c === "[") depth += 1;
            if (c === "]") depth -= 1;
            if (c === '"') {
              // skip string
              i += 1;
              while (i < n) {
                if (raw[i] === "\\") {
                  i += 2;
                  continue;
                }
                if (raw[i] === '"') break;
                i += 1;
              }
            }
            i += 1;
          }
        } else {
          skipValue();
        }
        expectKey = true;
        continue;
      }
      i += 1;
    }
    stack.pop();
  };
  while (i < n) {
    const ch = raw[i];
    if (ch === "{") {
      walkObject();
      continue;
    }
    i += 1;
  }
  return duplicates;
}

/** UTF-8 byte length. */
function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function hasAsciiControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Code-point-safe truncation to at most `maxBytes` UTF-8 bytes. */
function truncateUtf8(text: string, maxBytes: number): string {
  let out = "";
  let used = 0;
  for (const ch of text) {
    const need = utf8Bytes(ch);
    if (used + need > maxBytes) break;
    out += ch;
    used += need;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The validator's own minimal SMF emitter (E1 byte model, restated)           */
/* -------------------------------------------------------------------------- */

const EMIT_PPQ = 960;
const EMIT_VELOCITY = 96;
const EMIT_OFF_VELOCITY = 0;

function emitVlq(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x0f_ff_ff_ff) {
    throw new Error("vlq overflow");
  }
  const groups: number[] = [value & 0x7f];
  value = Math.floor(value / 128);
  while (value > 0) {
    groups.push(value & 0x7f);
    value = Math.floor(value / 128);
  }
  const out: number[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    out.push((groups[i] ?? 0) | (i > 0 ? 0x80 : 0));
  }
  return out;
}

function emitMeta(delta: number, type: number, payload: number[]): number[] {
  return [...emitVlq(delta), 0xff, type, ...emitVlq(payload.length), ...payload];
}

function textBytes(text: string): number[] {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length < 1 || bytes.length > 96) {
    throw new Error("midi.text_invalid");
  }
  for (const byte of bytes) {
    if (byte <= 0x1f || byte === 0x7f) throw new Error("midi.text_invalid");
  }
  return [...bytes];
}

type EmitMarker = Readonly<{ kind: string; eventId: string; text: string }>;
type EmitPitch = Readonly<{ step: string; alter: number; octave: number; midi: number }>;
type EmitEvent = Readonly<{
  eventId: string;
  ordinal: number;
  startTick: number;
  durationTicks: number;
  gateDurationTicks: number;
  pitches: readonly EmitPitch[];
}>;
type EmitPlan = Readonly<{
  documentId: string;
  tempoBpm: number;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  totalTicks: number;
  loop: unknown;
  events: readonly EmitEvent[];
}>;

type EmitResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; code: string; path: string }>;

function emitSmf(
  plan: EmitPlan,
  title: string,
  voicingTrack: string,
  instrument: string,
  markers: readonly EmitMarker[],
): EmitResult {
  for (const event of plan.events) {
    const seen = new Set<number>();
    for (const pitch of event.pitches) {
      if (seen.has(pitch.midi)) {
        return Object.freeze({
          ok: false,
          code: "midi.plan_invalid",
          path: `/plan/events/${String(event.ordinal)}/midiPitches`,
        });
      }
      seen.add(pitch.midi);
    }
  }
  try {
    const bytes: number[] = [];
    // header
    bytes.push(
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2,
      (EMIT_PPQ >> 8) & 0xff, EMIT_PPQ & 0xff,
    );
    // track 0
    const t0: number[] = [];
    let tick = 0;
    t0.push(...emitMeta(0, 0x03, textBytes(title)));
    const encodedTempo = Math.round(60_000_000 / plan.tempoBpm);
    t0.push(
      ...emitMeta(0, 0x51, [
        (encodedTempo >> 16) & 0xff,
        (encodedTempo >> 8) & 0xff,
        encodedTempo & 0xff,
      ]),
    );
    const beatUnitPower = Math.log2(plan.meter.beatUnit);
    t0.push(
      ...emitMeta(0, 0x58, [plan.meter.beatsPerBar, beatUnitPower, 24, 8]),
    );
    const startTickOf = new Map<string, number>();
    for (const event of plan.events) startTickOf.set(event.eventId, event.startTick);
    const orderedMarkers = markers
      .map((marker) => ({
        tick: startTickOf.get(marker.eventId) ?? 0,
        kindOrder: marker.kind === "section" ? 0 : 1,
        ordinal:
          plan.events.find((event) => event.eventId === marker.eventId)?.ordinal ?? 0,
        text: marker.text,
      }))
      .sort(
        (a, b) =>
          a.tick - b.tick || a.kindOrder - b.kindOrder || a.ordinal - b.ordinal,
      );
    for (const marker of orderedMarkers) {
      t0.push(...emitMeta(marker.tick - tick, 0x06, textBytes(marker.text)));
      tick = marker.tick;
    }
    t0.push(...emitMeta(plan.totalTicks - tick, 0x2f, []));
    bytes.push(0x4d, 0x54, 0x72, 0x6b);
    bytes.push(
      (t0.length >> 24) & 0xff,
      (t0.length >> 16) & 0xff,
      (t0.length >> 8) & 0xff,
      t0.length & 0xff,
    );
    bytes.push(...t0);
    // track 1
    const t1: number[] = [];
    t1.push(...emitMeta(0, 0x03, textBytes(voicingTrack)));
    t1.push(...emitMeta(0, 0x04, textBytes(instrument)));
    type Channel = Readonly<{ tick: number; order: number; note: number; status: number; velocity: number }>;
    const channels: Channel[] = [];
    for (const event of plan.events) {
      for (const pitch of event.pitches) {
        channels.push(
          Object.freeze({
            tick: event.startTick,
            order: 1,
            note: pitch.midi,
            status: 0x90,
            velocity: EMIT_VELOCITY,
          }),
        );
        channels.push(
          Object.freeze({
            tick: event.startTick + event.gateDurationTicks,
            order: 0,
            note: pitch.midi,
            status: 0x80,
            velocity: EMIT_OFF_VELOCITY,
          }),
        );
      }
    }
    channels.sort((a, b) => a.tick - b.tick || a.order - b.order || a.note - b.note);
    tick = 0;
    let previousStatus: number | null = null;
    for (const channel of channels) {
      t1.push(...emitVlq(channel.tick - tick));
      tick = channel.tick;
      if (channel.status !== previousStatus) t1.push(channel.status);
      previousStatus = channel.status;
      t1.push(channel.note, channel.velocity);
    }
    t1.push(...emitVlq(plan.totalTicks - tick), 0xff, 0x2f, 0x00);
    bytes.push(0x4d, 0x54, 0x72, 0x6b);
    bytes.push(
      (t1.length >> 24) & 0xff,
      (t1.length >> 16) & 0xff,
      (t1.length >> 8) & 0xff,
      t1.length & 0xff,
    );
    bytes.push(...t1);
    return Object.freeze({ ok: true, bytes: new Uint8Array(bytes) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return Object.freeze({ ok: false, code: message, path: "" });
  }
}

/* -------------------------------------------------------------------------- */
/* Derivation-law implementations (restated from the contract document)        */
/* -------------------------------------------------------------------------- */

function deriveTitle(title: string): {
  text: string;
  notice: Readonly<{ kind: string; originalUtf8ByteLength: number | null }> | null;
} {
  if (hasAsciiControl(title)) {
    return {
      text: U7_REVIEWED_DERIVATION_PINS.titleFallback,
      notice: { kind: "title-control-chars-substituted", originalUtf8ByteLength: null },
    };
  }
  const byteLength = utf8Bytes(title);
  if (byteLength > U7_REVIEWED_LIMITS.maxMarkerTextUtf8Bytes) {
    return {
      text: truncateUtf8(title, U7_REVIEWED_LIMITS.maxMarkerTextUtf8Bytes),
      notice: { kind: "title-truncated", originalUtf8ByteLength: byteLength },
    };
  }
  return { text: title, notice: null };
}

function deriveFilename(documentId: string): string {
  const safe = documentId.replace(/[^A-Za-z0-9._-]/g, "-");
  const full = `changes-${safe}.mid`;
  if (full.length <= U7_REVIEWED_LIMITS.maxFilenameCharacters) return full;
  return `${full.slice(0, U7_REVIEWED_LIMITS.maxFilenameCharacters - 4)}.mid`;
}

type DerivedMarkerRow = Readonly<{ kind: string; eventId: string; text: string }>;
type DerivedOmissionRow = Readonly<{
  eventId: string;
  markerKind: string;
  reason: string;
  utf8ByteLength: number;
}>;

function deriveMarkers(scenario: JsonObject): {
  markers: DerivedMarkerRow[];
  omissions: DerivedOmissionRow[];
} {
  const markers: DerivedMarkerRow[] = [];
  const omissions: DerivedOmissionRow[] = [];
  const sections = scenario["sections"];
  if (!Array.isArray(sections)) return { markers, omissions };
  for (const section of sections) {
    if (!isObject(section) || !Array.isArray(section["events"])) continue;
    const sectionName = typeof section["name"] === "string" ? section["name"] : "";
    let firstInSection = true;
    for (const event of section["events"]) {
      if (!isObject(event)) continue;
      const eventId = typeof event["eventId"] === "string" ? event["eventId"] : "";
      const candidates: { kind: string; text: string | null }[] = [];
      if (firstInSection) {
        candidates.push({ kind: "section", text: sectionName });
      }
      const chord = isObject(event["chord"]) ? event["chord"] : {};
      const canonical =
        typeof chord["canonicalMarkerText"] === "string"
          ? chord["canonicalMarkerText"]
          : null;
      candidates.push({ kind: "chord", text: canonical });
      firstInSection = false;
      for (const candidate of candidates) {
        const text = candidate.text;
        if (text === null) {
          omissions.push({
            eventId,
            markerKind: candidate.kind,
            reason: "format-refused",
            utf8ByteLength: 0,
          });
          continue;
        }
        if (text.trim().length === 0) {
          omissions.push({
            eventId,
            markerKind: candidate.kind,
            reason: "text-empty",
            utf8ByteLength: utf8Bytes(text),
          });
          continue;
        }
        if (hasAsciiControl(text)) {
          omissions.push({
            eventId,
            markerKind: candidate.kind,
            reason: "text-control-chars",
            utf8ByteLength: utf8Bytes(text),
          });
          continue;
        }
        if (utf8Bytes(text) > U7_REVIEWED_LIMITS.maxMarkerTextUtf8Bytes) {
          omissions.push({
            eventId,
            markerKind: candidate.kind,
            reason: "text-over-limit",
            utf8ByteLength: utf8Bytes(text),
          });
          continue;
        }
        markers.push({ kind: candidate.kind, eventId, text });
      }
    }
  }
  return { markers, omissions };
}

/* -------------------------------------------------------------------------- */
/* The restated transition oracle                                              */
/* -------------------------------------------------------------------------- */

type TransitionExpectation = Readonly<{
  to: string;
  outcome: JsonObject;
  registryAfter: string;
  announcementKey: string | null;
  politeness: string | null;
  cleanup: JsonObject | null;
}>;

const CLEANUP_ZERO = Object.freeze({
  cleanup: "complete",
  objectUrlsCreated: 0,
  objectUrlsRevoked: 0,
  outstandingOwnedResources: 0,
} as const);
const CLEANUP_ONE = Object.freeze({
  cleanup: "complete",
  objectUrlsCreated: 1,
  objectUrlsRevoked: 1,
  outstandingOwnedResources: 0,
} as const);
const CLEANUP_REVOKE_FAILED = Object.freeze({
  cleanup: "reconciliation-required",
  objectUrlsCreated: 1,
  objectUrlsRevoked: 0,
  outstandingOwnedResources: 1,
} as const);

const TRANSITION_ORACLE: Readonly<Record<string, TransitionExpectation>> =
  Object.freeze({
    "idle|open|document-available+compute-ok": {
      to: "preview-open",
      outcome: { kind: "preview", readiness: "ready" },
      registryAfter: "ready",
      announcementKey: "u7.announce.preview_ready",
      politeness: "polite",
      cleanup: null,
    },
    "idle|open|blockers-found": {
      to: "preview-open",
      outcome: { kind: "preview", readiness: "blocked" },
      registryAfter: "empty",
      announcementKey: "u7.announce.preview_blocked",
      politeness: "polite",
      cleanup: null,
    },
    "idle|open|no-current-document": {
      to: "idle",
      outcome: { kind: "refusal", code: "u7.document_unavailable" },
      registryAfter: "empty",
      announcementKey: "u7.announce.preview_blocked",
      politeness: "assertive",
      cleanup: null,
    },
    "idle|open|registry-busy": {
      to: "idle",
      outcome: { kind: "refusal", code: "u7.preparation_conflict" },
      registryAfter: "unchanged",
      announcementKey: "u7.announce.preview_blocked",
      politeness: "assertive",
      cleanup: null,
    },
    "idle|open|hash-port-failure": {
      to: "idle",
      outcome: { kind: "refusal", code: "u7.hash_unavailable" },
      registryAfter: "empty",
      announcementKey: "u7.announce.preview_blocked",
      politeness: "assertive",
      cleanup: null,
    },
    "preview-open|generate|binding-fresh": {
      to: "ready",
      outcome: { kind: "generated" },
      registryAfter: "ready",
      announcementKey: "u7.announce.ready",
      politeness: "polite",
      cleanup: null,
    },
    "preview-open|generate|binding-stale": {
      to: "preview-open",
      outcome: { kind: "stale", code: "u7.revision_stale" },
      registryAfter: "empty",
      announcementKey: "u7.announce.stale",
      politeness: "assertive",
      cleanup: null,
    },
    "preview-open|generate|artifact-missing": {
      to: "preview-open",
      outcome: { kind: "refusal", code: "u7.preparation_missing" },
      registryAfter: "empty",
      announcementKey: "u7.announce.preview_blocked",
      politeness: "assertive",
      cleanup: null,
    },
    "ready|download|binding-fresh+activation-ok": {
      to: "delivered",
      outcome: { kind: "delivery", delivery: "handed-off" },
      registryAfter: "empty",
      announcementKey: "u7.announce.handed_off",
      politeness: "polite",
      cleanup: CLEANUP_ONE,
    },
    "ready|download|binding-stale": {
      to: "preview-open",
      outcome: { kind: "stale", code: "u7.revision_stale" },
      registryAfter: "empty",
      announcementKey: "u7.announce.stale",
      politeness: "assertive",
      cleanup: null,
    },
    "delivered|download|second-take": {
      to: "delivered",
      outcome: { kind: "refusal", code: "u7.preparation_missing" },
      registryAfter: "empty",
      announcementKey: "u7.announce.delivery_failed",
      politeness: "assertive",
      cleanup: null,
    },
    "preview-open|cancel|always": {
      to: "idle",
      outcome: { kind: "cancelled" },
      registryAfter: "empty",
      announcementKey: "u7.announce.cancelled",
      politeness: "polite",
      cleanup: CLEANUP_ZERO,
    },
    "generating|cancel|always": {
      to: "idle",
      outcome: { kind: "cancelled" },
      registryAfter: "empty",
      announcementKey: "u7.announce.cancelled",
      politeness: "polite",
      cleanup: CLEANUP_ZERO,
    },
    "ready|cancel|always": {
      to: "idle",
      outcome: { kind: "cancelled" },
      registryAfter: "empty",
      announcementKey: "u7.announce.cancelled",
      politeness: "polite",
      cleanup: CLEANUP_ZERO,
    },
    "preview-open|close|always": {
      to: "idle",
      outcome: { kind: "closed" },
      registryAfter: "empty",
      announcementKey: "u7.announce.closed",
      politeness: "polite",
      cleanup: CLEANUP_ZERO,
    },
    "ready|close|always": {
      to: "idle",
      outcome: { kind: "closed" },
      registryAfter: "empty",
      announcementKey: "u7.announce.closed",
      politeness: "polite",
      cleanup: CLEANUP_ZERO,
    },
    "preview-open|re-preview|after-stale": {
      to: "preview-open",
      outcome: { kind: "preview", readiness: "ready" },
      registryAfter: "ready",
      announcementKey: "u7.announce.preview_ready",
      politeness: "polite",
      cleanup: null,
    },
    "delivered|re-preview|always": {
      to: "preview-open",
      outcome: { kind: "preview", readiness: "ready" },
      registryAfter: "ready",
      announcementKey: "u7.announce.preview_ready",
      politeness: "polite",
      cleanup: null,
    },
    "delivered|dismiss-delivered|always": {
      to: "idle",
      outcome: { kind: "closed" },
      registryAfter: "empty",
      announcementKey: "u7.announce.closed",
      politeness: "polite",
      cleanup: null,
    },
    "delivering|download|activation-started": {
      to: "delivered",
      outcome: { kind: "delivery", delivery: "handed-off" },
      registryAfter: "empty",
      announcementKey: "u7.announce.handed_off",
      politeness: "polite",
      cleanup: CLEANUP_ONE,
    },
    "delivering|download|activation-threw": {
      to: "ready",
      outcome: { kind: "delivery", delivery: "failed" },
      registryAfter: "ready",
      announcementKey: "u7.announce.delivery_failed",
      politeness: "assertive",
      cleanup: CLEANUP_ZERO,
    },
    "delivering|download|revoke-threw": {
      to: "delivered",
      outcome: {
        kind: "refusal",
        code: "u7.delivery_cleanup_failed",
        cleanup: "reconciliation-required",
      },
      registryAfter: "empty",
      announcementKey: "u7.announce.cleanup_failed",
      politeness: "assertive",
      cleanup: CLEANUP_REVOKE_FAILED,
    },
    "delivering|cancel|affordance-absent": {
      to: "delivering",
      outcome: { kind: "ignored" },
      registryAfter: "delivering",
      announcementKey: null,
      politeness: null,
      cleanup: null,
    },
    "idle|open|work-counter-exceeded": {
      to: "idle",
      outcome: { kind: "refusal", code: "limit.u7_preview_work_exceeded" },
      registryAfter: "empty",
      announcementKey: "u7.announce.preview_blocked",
      politeness: "assertive",
      cleanup: null,
    },
  });

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

export type U7ContractValidationReport = Readonly<{
  schema: "changes.validation.u7-contract.v1";
  package: "U7";
  outcome: "pass" | "fail";
  reviewState: string;
  pinState: string;
  productionImplementationClaim: boolean;
  uiCompletionClaim: boolean;
  humanAcceptanceClaim: boolean;
  expertReviewClaim: boolean;
  counts: Readonly<{
    companions: number;
    previewCases: number;
    stateCases: number;
    accessibilityMatrixRows: number;
    limitCases: number;
    traces: number;
    authorities: number;
    mutationControls: number;
    mutationControlsReplayed: number;
  }>;
  findings: readonly U7ContractFinding[];
}>;

const VALIDATOR_FILE_SET = Object.freeze([
  "u7-midi-export-workflow-contract.json",
  ...U7_REVIEWED_COMPANIONS,
] as const);

/* -------------------------------------------------------------------------- */
/* Phase oracles. Each takes an explicit findings sink so mutation replay can  */
/* re-run exactly one phase against a mutated document copy.                   */
/* -------------------------------------------------------------------------- */

type AddFinding = (code: string, path: string, message: string) => void;

type PacketDocs = ReadonlyMap<string, JsonObject>;

function caseList(docs: PacketDocs, file: string): unknown[] {
  const doc = docs.get(file);
  return doc !== undefined && Array.isArray(doc["cases"]) ? doc["cases"] : [];
}

function allCaseIdsOf(docs: PacketDocs): Set<string> {
  const ids = new Set<string>();
  for (const file of ["preview-cases.json", "state-cases.json", "limit-cases.json"]) {
    for (const entry of caseList(docs, file)) {
      if (isObject(entry) && typeof entry["id"] === "string") ids.add(entry["id"]);
    }
  }
  return ids;
}

function authorityIdsOf(docs: PacketDocs): Set<string> {
  const ids = new Set<string>();
  const doc = docs.get("provenance-ledger.json");
  const rows = doc !== undefined && Array.isArray(doc["authorities"]) ? doc["authorities"] : [];
  for (const row of rows) {
    if (isObject(row) && typeof row["id"] === "string") ids.add(row["id"]);
  }
  return ids;
}

function runPreviewOracle(docs: PacketDocs, add: AddFinding): void {
  for (const entry of caseList(docs, "preview-cases.json")) {
    if (!isObject(entry)) {
      add("U7_CONTRACT_PREVIEW_CASE", "preview-cases", "case is not an object");
      continue;
    }
    const id = typeof entry["id"] === "string" ? entry["id"] : "<unknown>";
    const at = (path: string): string => `${id}.${path}`;
    if (!isObject(entry["scenario"]) || !isObject(entry["expectedPreview"])) {
      add("U7_CONTRACT_PREVIEW_CASE", id, "case lacks scenario or expectedPreview");
      continue;
    }
    const scenario = entry["scenario"];
    const upstream = isObject(entry["upstreamScenario"]) ? entry["upstreamScenario"] : {};
    const expected = entry["expectedPreview"];
    const planSpec = isObject(entry["planSpec"]) ? (entry["planSpec"] as unknown as EmitPlan) : null;

    const realizationOk =
      upstream["realization"] === "ok" || upstream["realization"] === "ok-with-unbound-custom";
    const planOk = realizationOk && upstream["planCompile"] === "ok";
    const exportReached = planOk;
    const exportOk = exportReached && upstream["export"] === "ok";

    const derived = deriveMarkers(scenario);
    if (!exportReached) {
      if (JSON.stringify(expected["derivedMarkers"]) !== "[]") {
        add("U7_CONTRACT_PREVIEW_DERIVATION", at("derivedMarkers"), "markers are never derived when the pipeline stops before export");
      }
      if (JSON.stringify(expected["markerOmissions"]) !== "[]") {
        add("U7_CONTRACT_PREVIEW_DERIVATION", at("markerOmissions"), "omissions are never derived when the pipeline stops before export");
      }
    } else {
      if (JSON.stringify(expected["derivedMarkers"]) !== JSON.stringify(derived.markers)) {
        add("U7_CONTRACT_PREVIEW_DERIVATION", at("derivedMarkers"), `derived markers ${JSON.stringify(derived.markers)} differ from the expectation`);
      }
      if (JSON.stringify(expected["markerOmissions"]) !== JSON.stringify(derived.omissions)) {
        add("U7_CONTRACT_PREVIEW_DERIVATION", at("markerOmissions"), `derived omissions ${JSON.stringify(derived.omissions)} differ from the expectation`);
      }
    }

    const scenarioTitle = typeof scenario["title"] === "string" ? scenario["title"] : "";
    const derivedTitle = deriveTitle(scenarioTitle);
    if (expected["derivedTitle"] !== derivedTitle.text) {
      add("U7_CONTRACT_PREVIEW_DERIVATION", at("derivedTitle"), "title derivation mismatch");
    }
    if (JSON.stringify(expected["titleNotice"] ?? null) !== JSON.stringify(derivedTitle.notice)) {
      add("U7_CONTRACT_PREVIEW_DERIVATION", at("titleNotice"), "title notice mismatch");
    }

    const events: JsonObject[] = [];
    if (Array.isArray(scenario["sections"])) {
      for (const section of scenario["sections"]) {
        if (isObject(section) && Array.isArray(section["events"])) {
          for (const event of section["events"]) {
            if (isObject(event)) events.push(event);
          }
        }
      }
    }

    const derivedBlockers: JsonObject[] = [];
    if (events.length === 0) {
      derivedBlockers.push({ kind: "empty-chart", code: null, eventId: null });
    } else if (!realizationOk) {
      const refusals = Array.isArray(upstream["realizationRefusals"]) ? upstream["realizationRefusals"] : [];
      for (const refusal of refusals) {
        if (isObject(refusal)) {
          derivedBlockers.push({
            kind: "realization",
            code: refusal["code"] ?? null,
            eventId: refusal["eventId"] ?? null,
            message: refusal["message"] ?? null,
          });
        }
      }
    } else if (upstream["planCompile"] === "refused") {
      const refusals = Array.isArray(upstream["planRefusals"]) ? upstream["planRefusals"] : [];
      for (const refusal of refusals) {
        if (isObject(refusal)) {
          derivedBlockers.push({
            kind: "plan",
            code: refusal["code"] ?? null,
            eventId: refusal["eventId"] ?? null,
            message: refusal["message"] ?? null,
          });
        }
      }
    } else if (exportReached && !exportOk && planSpec !== null) {
      const emitted = emitSmf(
        planSpec,
        derivedTitle.text,
        U7_REVIEWED_DERIVATION_PINS.voicingTrackName,
        U7_REVIEWED_DERIVATION_PINS.instrumentName,
        derived.markers,
      );
      if (emitted.ok) {
        add("U7_CONTRACT_BLOCKER", at("blockers"), "upstream declares an export refusal but the independent emitter produced bytes");
      } else {
        const declared = isObject(upstream["exportRefusal"]) ? upstream["exportRefusal"] : {};
        if (declared["code"] !== emitted["code"] || declared["path"] !== emitted["path"]) {
          add("U7_CONTRACT_BLOCKER", at("upstreamScenario.exportRefusal"), `declared refusal differs from the independently derived ${emitted.code} at ${emitted.path}`);
        }
        const pathMatch = /^\/plan\/events\/(\d+)\//.exec(emitted.path);
        derivedBlockers.push({
          kind: "export",
          code: emitted.code,
          eventId:
            pathMatch !== null
              ? planSpec.events[Number(pathMatch[1])]?.eventId ?? null
              : null,
        });
      }
    }

    const expectedBlockers = Array.isArray(expected["blockers"]) ? expected["blockers"] : [];
    if (derivedBlockers.length > 0) {
      if (expected["readiness"] !== "blocked") {
        add("U7_CONTRACT_BLOCKER", at("readiness"), "blockers exist but readiness is not blocked");
      }
      if (expected["artifact"] !== null) {
        add("U7_CONTRACT_BLOCKER", at("artifact"), "a blocked preview carries no artifact");
      }
      if (expectedBlockers.length !== derivedBlockers.length) {
        add("U7_CONTRACT_BLOCKER", at("blockers"), `expected ${String(derivedBlockers.length)} blockers, found ${String(expectedBlockers.length)}`);
      } else {
        for (let i = 0; i < derivedBlockers.length; i += 1) {
          const derivedRow = derivedBlockers[i];
          const expectedRow: unknown = expectedBlockers[i];
          if (!isObject(expectedRow) || derivedRow === undefined) continue;
          if (
            expectedRow["kind"] !== derivedRow["kind"] ||
            expectedRow["code"] !== derivedRow["code"] ||
            expectedRow["eventId"] !== derivedRow["eventId"]
          ) {
            add("U7_CONTRACT_BLOCKER", at(`blockers.${String(i)}`), `expected blocker ${JSON.stringify(derivedRow)} differs from the fixture`);
          }
        }
      }
    } else {
      if (expected["readiness"] !== "ready") {
        add("U7_CONTRACT_BLOCKER", at("readiness"), "no blockers but readiness is not ready");
      }
      if (expectedBlockers.length !== 0) {
        add("U7_CONTRACT_BLOCKER", at("blockers"), "a ready preview carries no blockers");
      }
    }

    const summary = isObject(expected["realization"]) ? expected["realization"] : {};
    let storedManual = 0;
    let storedFrozen = 0;
    let generated = 0;
    const externalBass: string[] = [];
    const refusedEventIds = new Set<string>();
    if (Array.isArray(upstream["realizationRefusals"])) {
      for (const refusal of upstream["realizationRefusals"]) {
        if (isObject(refusal) && typeof refusal["eventId"] === "string") refusedEventIds.add(refusal["eventId"]);
      }
    }
    for (const event of events) {
      const voicing = isObject(event["voicing"]) ? event["voicing"] : {};
      const chord = isObject(event["chord"]) ? event["chord"] : {};
      const eventId = typeof event["eventId"] === "string" ? event["eventId"] : "";
      if (refusedEventIds.has(eventId)) continue;
      const mode = voicing["mode"];
      const isCustom = chord["kind"] === "custom";
      if (mode === "manual") storedManual += 1;
      if (mode === "frozen") storedFrozen += 1;
      if (mode === "auto" && !isCustom) generated += 1;
      const binds = mode === "manual" || mode === "frozen" || (mode === "auto" && !isCustom);
      if (binds && voicing["bassPolicy"] === "external") externalBass.push(eventId);
    }
    if (
      summary["storedManualCount"] !== storedManual ||
      summary["storedFrozenCount"] !== storedFrozen ||
      summary["generatedCount"] !== generated ||
      JSON.stringify(summary["externalBassEventIds"]) !== JSON.stringify(externalBass)
    ) {
      add("U7_CONTRACT_PREVIEW_DERIVATION", at("realization"), "realization summary differs from the expectation");
    }

    if (expected["ppq"] !== 960 || expected["trackCount"] !== 2) {
      add("U7_CONTRACT_PREVIEW_DERIVATION", at("ppq"), "PPQ/track-count pins mismatch");
    }
    if (typeof scenario["tempoBpm"] === "number" && expected["tempoBpm"] !== scenario["tempoBpm"]) {
      add("U7_CONTRACT_PREVIEW_DERIVATION", at("tempoBpm"), "tempo disclosure mismatch");
    }
    if (isObject(scenario["meter"]) && JSON.stringify(expected["meter"]) !== JSON.stringify(scenario["meter"])) {
      add("U7_CONTRACT_PREVIEW_DERIVATION", at("meter"), "meter disclosure mismatch");
    }

    if (derivedBlockers.length === 0 && planSpec !== null) {
      const emitted = emitSmf(
        planSpec,
        derivedTitle.text,
        U7_REVIEWED_DERIVATION_PINS.voicingTrackName,
        U7_REVIEWED_DERIVATION_PINS.instrumentName,
        derived.markers,
      );
      if (!emitted.ok) {
        add("U7_CONTRACT_PREVIEW_CASE", at("artifact"), `ready case must emit bytes: ${emitted.code}`);
      } else {
        const artifact = isObject(expected["artifact"]) ? expected["artifact"] : {};
        if (artifact["byteLength"] !== emitted.bytes.length) {
          add("U7_CONTRACT_BYTE_LENGTH", at("artifact.byteLength"), `emitted ${String(emitted.bytes.length)} bytes, fixture pins ${JSON.stringify(artifact["byteLength"])}`);
        }
        const digest = sha256HexBytes(emitted.bytes);
        if (artifact["sha256"] !== digest) {
          add("U7_CONTRACT_HASH_RELATION", at("artifact.sha256"), `emitted digest ${digest} differs from the pin`);
        }
        if (artifact["filename"] !== deriveFilename(String(scenario["documentId"]))) {
          add("U7_CONTRACT_PREVIEW_DERIVATION", at("artifact.filename"), "filename law mismatch");
        }
        const tempo = isObject(artifact["tempo"]) ? artifact["tempo"] : {};
        const bpm = Number(scenario["tempoBpm"]);
        const encoded = Math.round(60_000_000 / bpm);
        if (
          tempo["requestedBpm"] !== scenario["tempoBpm"] ||
          tempo["encodedMicrosecondsPerQuarter"] !== encoded ||
          tempo["roundingErrorNumerator"] !== Math.abs(60_000_000 - encoded * bpm) ||
          tempo["roundingErrorDenominator"] !== scenario["tempoBpm"]
        ) {
          add("U7_CONTRACT_TEMPO_LAW", at("artifact.tempo"), "tempo encoding or rounding-error pair mismatch");
        }
        let noteCount = 0;
        for (const event of planSpec.events) noteCount += event.pitches.length;
        if (artifact["noteCount"] !== noteCount) {
          add("U7_CONTRACT_PREVIEW_DERIVATION", at("artifact.noteCount"), "note count mismatch");
        }
        if (artifact["markerCount"] !== derived.markers.length) {
          add("U7_CONTRACT_PREVIEW_DERIVATION", at("artifact.markerCount"), "marker count mismatch");
        }
        const spellingIds: string[] = [];
        for (const event of planSpec.events) {
          if (event.pitches.some((pitch) => pitch.alter !== 0)) spellingIds.push(event.eventId);
        }
        const chordMarkedIds: Record<string, true> = {};
        for (const marker of derived.markers) {
          if (marker.kind === "chord") chordMarkedIds[marker.eventId] = true;
        }
        const annotationIds: string[] = [];
        for (const event of planSpec.events) {
          if (chordMarkedIds[event.eventId] !== true) annotationIds.push(event.eventId);
        }
        const derivedLosses: JsonObject[] = [];
        if (spellingIds.length > 0) derivedLosses.push({ kind: "enharmonic-spelling", eventIds: spellingIds });
        if (annotationIds.length > 0) derivedLosses.push({ kind: "annotation-text", eventIds: annotationIds });
        if (planSpec.loop !== null) {
          add("U7_CONTRACT_PREVIEW_DERIVATION", at("planSpec.loop"), "U7 always exports loop=null; a looped planSpec violates the stated invariant");
        }
        if (JSON.stringify(expected["losses"] ?? null) !== JSON.stringify(derivedLosses)) {
          add("U7_CONTRACT_PREVIEW_DERIVATION", at("losses"), `derived losses ${JSON.stringify(derivedLosses)} differ from the expectation`);
        }
      }
    }

    for (const traceId of Array.isArray(entry["traceIds"]) ? entry["traceIds"] : []) {
      if (typeof traceId !== "string" || !traceId.startsWith("U7-TRACE-")) {
        add("U7_CONTRACT_UNKNOWN_LINK", at("traceIds"), "trace id is malformed");
      }
    }
    for (const authorityId of Array.isArray(entry["authorityIds"]) ? entry["authorityIds"] : []) {
      if (typeof authorityId !== "string" || !authorityId.startsWith("U7-AUTH-")) {
        add("U7_CONTRACT_UNKNOWN_LINK", at("authorityIds"), "authority id is malformed");
      }
    }
  }
}

const REQUIRED_MATRIX_ROW_KEYS = Object.freeze([
  "state",
  "surface",
  "overlay",
  "initialFocus",
  "allowedActions",
  "focusReturn",
  "announcementKey",
] as const);

function runStateOracle(docs: PacketDocs, add: AddFinding): void {
  for (const entry of caseList(docs, "state-cases.json")) {
    if (!isObject(entry)) {
      add("U7_CONTRACT_STATE_CASE", "state-cases", "case is not an object");
      continue;
    }
    const id = typeof entry["id"] === "string" ? entry["id"] : "<unknown>";
    const key = `${String(entry["from"])}|${String(entry["action"])}|${String(entry["condition"])}`;
    const expected = TRANSITION_ORACLE[key];
    if (expected === undefined) {
      add("U7_CONTRACT_STATE_CASE", id, `no restated transition for ${key}`);
      continue;
    }
    if (entry["to"] !== expected["to"]) {
      add("U7_CONTRACT_STATE_CASE", `${id}.to`, `expected ${expected.to}`);
    }
    if (JSON.stringify(entry["outcome"]) !== JSON.stringify(expected["outcome"])) {
      add("U7_CONTRACT_STATE_CASE", `${id}.outcome`, `expected ${JSON.stringify(expected.outcome)}`);
    }
    if (entry["registryAfter"] !== expected["registryAfter"]) {
      add("U7_CONTRACT_STATE_CASE", `${id}.registryAfter`, `expected ${expected.registryAfter}`);
    }
    if ((entry["announcementKey"] ?? null) !== expected["announcementKey"]) {
      add("U7_CONTRACT_STATE_CASE", `${id}.announcementKey`, `expected ${JSON.stringify(expected.announcementKey)}`);
    }
    if ((entry["politeness"] ?? null) !== expected["politeness"]) {
      add("U7_CONTRACT_STATE_CASE", `${id}.politeness`, `expected ${JSON.stringify(expected.politeness)}`);
    }
    if (JSON.stringify(entry["cleanup"] ?? null) !== JSON.stringify(expected["cleanup"])) {
      add("U7_CONTRACT_STATE_CASE", `${id}.cleanup`, `expected ${JSON.stringify(expected.cleanup)}`);
    }
    if (!U7_REVIEWED_WORKFLOW_STATES.includes(entry["from"] as never)) {
      add("U7_CONTRACT_STATE_CASE", `${id}.from`, "unknown workflow state");
    }
    if (!U7_REVIEWED_WORKFLOW_STATES.includes(entry["to"] as never)) {
      add("U7_CONTRACT_STATE_CASE", `${id}.to`, "unknown workflow state");
    }
    if (!U7_REVIEWED_WORKFLOW_ACTIONS.includes(entry["action"] as never)) {
      add("U7_CONTRACT_STATE_CASE", `${id}.action`, "unknown workflow action");
    }
    if (entry["announcementKey"] !== null && !U7_REVIEWED_ANNOUNCEMENT_KEYS.includes(entry["announcementKey"] as never)) {
      add("U7_CONTRACT_STATE_CASE", `${id}.announcementKey`, "unknown announcement key");
    }
    const cleanup = entry["cleanup"];
    if (isObject(cleanup)) {
      const created = Number(cleanup["objectUrlsCreated"]);
      const revoked = Number(cleanup["objectUrlsRevoked"]);
      if (revoked > created || created - revoked !== Number(cleanup["outstandingOwnedResources"]) || created > 1) {
        add("U7_CONTRACT_STATE_CASE", `${id}.cleanup`, "cleanup accounting does not conserve object URLs");
      }
    }
  }

  const stateDoc = docs.get("state-cases.json");
  const matrix = stateDoc !== undefined && Array.isArray(stateDoc["accessibilityMatrix"]) ? stateDoc["accessibilityMatrix"] : [];
  const seenPairs = new Set<string>();
  for (const row of matrix) {
    if (!isObject(row)) {
      add("U7_CONTRACT_MATRIX", "accessibilityMatrix", "row is not an object");
      continue;
    }
    const pairKey = `${String(row["state"])}|${String(row["surface"])}`;
    for (const key of REQUIRED_MATRIX_ROW_KEYS) {
      if (!(key in row)) {
        add("U7_CONTRACT_MATRIX", pairKey, `row lacks ${key}`);
      }
    }
    if (seenPairs.has(pairKey)) {
      add("U7_CONTRACT_MATRIX", pairKey, "duplicate state×surface row");
    }
    seenPairs.add(pairKey);
    if (row["state"] !== "idle") {
      if (row["surface"] === "dialog" && row["overlay"] !== "Dialog") {
        add("U7_CONTRACT_MATRIX", pairKey, "dialog surface renders the Dialog overlay");
      }
      if (row["surface"] === "sheet" && row["overlay"] !== "SheetDrawer") {
        add("U7_CONTRACT_MATRIX", pairKey, "sheet surface renders the SheetDrawer overlay");
      }
      if (typeof row["announcementKey"] === "string" && !U7_REVIEWED_ANNOUNCEMENT_KEYS.includes(row["announcementKey"] as never)) {
        add("U7_CONTRACT_MATRIX", pairKey, "unknown announcement key");
      }
    }
    if (Array.isArray(row["allowedActions"])) {
      for (const action of row["allowedActions"]) {
        if (!U7_REVIEWED_WORKFLOW_ACTIONS.includes(action as never)) {
          add("U7_CONTRACT_MATRIX", pairKey, `unknown allowed action ${String(action)}`);
        }
      }
    }
  }
  for (const state of U7_REVIEWED_WORKFLOW_STATES) {
    for (const surface of ["dialog", "sheet"]) {
      if (!seenPairs.has(`${state}|${surface}`)) {
        add("U7_CONTRACT_MATRIX", `${state}|${surface}`, "missing state×surface row");
      }
    }
  }
}

function runLimitOracle(docs: PacketDocs, add: AddFinding): void {
  const stateDoc = docs.get("state-cases.json");
  const matrix = stateDoc !== undefined && Array.isArray(stateDoc["accessibilityMatrix"]) ? stateDoc["accessibilityMatrix"] : [];
  for (const entry of caseList(docs, "limit-cases.json")) {
    if (!isObject(entry)) {
      add("U7_CONTRACT_LIMIT_CASE", "limit-cases", "case is not an object");
      continue;
    }
    const id = typeof entry["id"] === "string" ? entry["id"] : "<unknown>";
    const input = isObject(entry["input"]) ? entry["input"] : {};
    const expected = isObject(entry["expected"]) ? entry["expected"] : {};
    switch (entry["kind"]) {
      case "marker-text": {
        const text = typeof input["text"] === "string" ? input["text"] : "";
        const bytes = utf8Bytes(text);
        if (input["utf8ByteLength"] !== bytes) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.input["utf8ByteLength"]`, `declared ${JSON.stringify(input["utf8ByteLength"])} but the text is ${String(bytes)} bytes`);
        }
        const disposition = hasAsciiControl(text) || bytes > U7_REVIEWED_LIMITS.maxMarkerTextUtf8Bytes ? "omitted" : "kept";
        const reason = hasAsciiControl(text)
          ? "text-control-chars"
          : bytes > U7_REVIEWED_LIMITS.maxMarkerTextUtf8Bytes
            ? "text-over-limit"
            : null;
        if (expected["disposition"] !== disposition) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.disposition`, `expected ${disposition}`);
        }
        if ((expected["reason"] ?? null) !== reason) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.reason`, `expected ${JSON.stringify(reason)}`);
        }
        break;
      }
      case "title": {
        const text = typeof input["text"] === "string" ? input["text"] : "";
        const bytes = utf8Bytes(text);
        if (input["utf8ByteLength"] !== bytes) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.input["utf8ByteLength"]`, `declared ${JSON.stringify(input["utf8ByteLength"])} but the text is ${String(bytes)} bytes`);
        }
        const derived = deriveTitle(text);
        const disposition = hasAsciiControl(text)
          ? "substituted"
          : bytes > U7_REVIEWED_LIMITS.maxMarkerTextUtf8Bytes
            ? "truncated"
            : "verbatim";
        if (expected["disposition"] !== disposition) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.disposition`, `expected ${disposition}`);
        }
        if (expected["derivedTitle"] !== derived.text) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.derivedTitle`, "title derivation mismatch");
        }
        if (JSON.stringify(expected["titleNotice"] ?? null) !== JSON.stringify(derived.notice)) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.titleNotice`, "title notice mismatch");
        }
        if (disposition === "truncated" && expected["derivedUtf8ByteLength"] !== utf8Bytes(derived.text)) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.derivedUtf8ByteLength`, "truncated byte length mismatch");
        }
        break;
      }
      case "arithmetic-relation": {
        const holds =
          U7_REVIEWED_LIMITS.maxChordEvents + U7_REVIEWED_LIMITS.maxSections ===
          U7_REVIEWED_LIMITS.maxMarkers;
        if (
          input["maxChordEvents"] !== U7_REVIEWED_LIMITS["maxChordEvents"] ||
          input["maxSections"] !== U7_REVIEWED_LIMITS["maxSections"] ||
          input["maxMarkers"] !== U7_REVIEWED_LIMITS["maxMarkers"]
        ) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.input`, "relation inputs must restate the reviewed caps");
        }
        if (expected["holds"] !== holds || expected["relation"] !== "maxChordEvents + maxSections === maxMarkers") {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected`, "arithmetic relation mismatch");
        }
        break;
      }
      case "preparation-id": {
        const isConstructible = (value: unknown): boolean =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= U7_REVIEWED_LIMITS.minPreparationId &&
          value <= U7_REVIEWED_LIMITS.maxPreparationId;
        for (const value of Array.isArray(expected["accepted"]) ? expected["accepted"] : []) {
          if (!isConstructible(value)) {
            add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.accepted`, `${JSON.stringify(value)} is not constructible`);
          }
        }
        for (const value of Array.isArray(expected["refused"]) ? expected["refused"] : []) {
          if (isConstructible(value)) {
            add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.refused`, `${JSON.stringify(value)} is constructible`);
          }
        }
        break;
      }
      case "matrix-completeness": {
        const expectedRows = U7_REVIEWED_WORKFLOW_STATES.length * 2;
        if (input["expectedRows"] !== expectedRows || expected["rowsPresent"] !== matrix.length || matrix.length !== expectedRows) {
          add("U7_CONTRACT_LIMIT_CASE", id, "matrix row count mismatch");
        }
        if (JSON.stringify(expected["rowKeys"]) !== JSON.stringify([...REQUIRED_MATRIX_ROW_KEYS])) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.rowKeys`, "matrix row vocabulary mismatch");
        }
        break;
      }
      case "filename": {
        const derivedName = deriveFilename(typeof input["documentId"] === "string" ? input["documentId"] : "");
        if (expected["filename"] !== derivedName) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.filename`, `derived ${derivedName}`);
        }
        if (expected["characters"] !== derivedName.length) {
          add("U7_CONTRACT_LIMIT_CASE", `${id}.expected.characters`, "filename length mismatch");
        }
        break;
      }
      default:
        add("U7_CONTRACT_LIMIT_CASE", id, `unknown limit-case kind ${String(entry["kind"])}`);
    }
  }
}

function runTraceOracle(docs: PacketDocs, add: AddFinding): void {
  const allCaseIds = allCaseIdsOf(docs);
  const traceDoc = docs.get("trace-ledger.json");
  const traces = traceDoc !== undefined && Array.isArray(traceDoc["traces"]) ? traceDoc["traces"] : [];
  const lawCoverage = traceDoc !== undefined && Array.isArray(traceDoc["lawCoverage"]) ? traceDoc["lawCoverage"] : [];
  const traceIds = new Set<string>();
  for (const trace of traces) {
    if (!isObject(trace)) continue;
    const id = typeof trace["id"] === "string" ? trace["id"] : "<unknown>";
    traceIds.add(id);
    for (const caseId of Array.isArray(trace["caseIds"]) ? trace["caseIds"] : []) {
      if (typeof caseId !== "string" || !allCaseIds.has(caseId)) {
        add("U7_CONTRACT_UNKNOWN_LINK", `${id}.caseIds`, `unknown case ${String(caseId)}`);
      }
    }
    for (const lawId of Array.isArray(trace["lawIds"]) ? trace["lawIds"] : []) {
      if (!U7_REVIEWED_LAW_IDS.includes(lawId as never)) {
        add("U7_CONTRACT_UNKNOWN_LINK", `${id}.lawIds`, `unknown law ${String(lawId)}`);
      }
    }
    if (!Array.isArray(trace["evidenceOwners"]) || trace["evidenceOwners"].length === 0) {
      add("U7_CONTRACT_TRACE", id, "a trace names no evidence owner");
    }
  }
  const coveredLaws = new Set<string>();
  for (const row of lawCoverage) {
    if (!isObject(row)) continue;
    const lawId = typeof row["lawId"] === "string" ? row["lawId"] : "";
    coveredLaws.add(lawId);
    if (!U7_REVIEWED_LAW_IDS.includes(lawId as never)) {
      add("U7_CONTRACT_LAW_COVERAGE", lawId, "coverage row names an unknown law");
      continue;
    }
    const positive: unknown[] = Array.isArray(row["positive"]) ? row["positive"] : [];
    const negative: unknown[] = Array.isArray(row["negative"]) ? row["negative"] : [];
    if (positive.length === 0 || negative.length === 0) {
      add("U7_CONTRACT_LAW_COVERAGE", lawId, "a law needs at least one positive and one negative/near-miss case");
    }
    for (const caseId of [...positive, ...negative]) {
      if (typeof caseId !== "string" || !allCaseIds.has(caseId)) {
        add("U7_CONTRACT_UNKNOWN_LINK", lawId, `coverage names unknown case ${String(caseId)}`);
      }
    }
  }
  for (const lawId of U7_REVIEWED_LAW_IDS) {
    if (!coveredLaws.has(lawId)) {
      add("U7_CONTRACT_LAW_COVERAGE", lawId, "law has no coverage row");
    }
  }
  for (const file of ["preview-cases.json", "state-cases.json", "limit-cases.json"]) {
    for (const entry of caseList(docs, file)) {
      if (!isObject(entry) || typeof entry["id"] !== "string") continue;
      for (const traceId of Array.isArray(entry["traceIds"]) ? entry["traceIds"] : []) {
        if (typeof traceId !== "string" || !traceId.startsWith("U7-TRACE-")) continue;
        if (!traceIds.has(traceId)) {
          add("U7_CONTRACT_UNKNOWN_LINK", `${entry["id"]}.traceIds`, `unknown trace ${traceId}`);
          continue;
        }
        const trace: unknown = traces.find((row) => isObject(row) && row["id"] === traceId);
        const linked = isObject(trace) && Array.isArray(trace["caseIds"]) ? trace["caseIds"] : [];
        if (!linked.includes(entry["id"])) {
          add("U7_CONTRACT_NONRECIPROCAL_LINK", `${entry["id"]}→${traceId}`, "case names a trace that does not name it back");
        }
      }
    }
  }
}

function runProvenanceOracle(docs: PacketDocs, add: AddFinding): void {
  const doc = docs.get("provenance-ledger.json");
  if (doc !== undefined && (doc["expectedValuesGenerated"] !== false || doc["productionOutputUsedAsOracle"] !== false)) {
    add("U7_CONTRACT_INDEPENDENCE", "provenance-ledger", "independence flags must both be false");
  }
  const authorityIds = authorityIdsOf(docs);
  const rows = doc !== undefined && Array.isArray(doc["authorities"]) ? doc["authorities"] : [];
  for (const row of rows) {
    if (!isObject(row)) continue;
    if (typeof row["id"] !== "string" || typeof row["ref"] !== "string" || typeof row["scope"] !== "string") {
      add("U7_CONTRACT_PROVENANCE", "provenance-ledger", "authority row lacks id/ref/scope");
    }
  }
  for (const entry of caseList(docs, "preview-cases.json")) {
    if (!isObject(entry)) continue;
    for (const authorityId of Array.isArray(entry["authorityIds"]) ? entry["authorityIds"] : []) {
      if (typeof authorityId === "string" && authorityId.startsWith("U7-AUTH-") && !authorityIds.has(authorityId)) {
        add("U7_CONTRACT_UNKNOWN_LINK", `${String(entry["id"])}.authorityIds`, `unknown authority ${authorityId}`);
      }
    }
  }
}

/** Manifest vocabulary/coherence checks (digest layers live in the main pass). */
function runManifestSemanticOracle(docs: PacketDocs, add: AddFinding): void {
  const manifest = docs.get("u7-midi-export-workflow-contract.json");
  if (manifest === undefined) return;
  for (const flag of [
    "productionImplementationClaim",
    "uiCompletionClaim",
    "humanAcceptanceClaim",
    "expertReviewClaim",
  ]) {
    if (manifest[flag] !== false) {
      add("U7_CONTRACT_VERSION", `manifest.${flag}`, "a proposed packet claims nothing");
    }
  }
  if (JSON.stringify(manifest["limits"]) !== JSON.stringify({ ...U7_REVIEWED_LIMITS })) {
    add("U7_CONTRACT_LIMITS", "manifest.limits", "limits must equal the restated reviewed limits");
  }
  if (JSON.stringify(manifest["refusalCodes"]) !== JSON.stringify([...U7_REVIEWED_REFUSAL_CODES])) {
    add("U7_CONTRACT_REFUSAL_CODES", "manifest.refusalCodes", "refusal vocabulary mismatch");
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

export async function validateU7Contract(
  fixtureRoot: string = resolve("tests/fixtures/midi-export-workflow"),
  options: Readonly<{ allowPendingFreeze?: boolean }> = {},
): Promise<U7ContractValidationReport> {
  const findings: U7ContractFinding[] = [];
  const add: AddFinding = (code, path, message) => {
    findings.push(finding(code, path, message));
  };

  let names: string[] = [];
  try {
    names = (await readdir(fixtureRoot)).filter((name) => name.endsWith(".json"));
  } catch {
    add("U7_CONTRACT_ROOT", fixtureRoot, "fixture root is unreadable");
  }
  const expectedSet = [...VALIDATOR_FILE_SET].sort();
  const actualSet = [...names].sort();
  if (JSON.stringify(actualSet) !== JSON.stringify(expectedSet)) {
    add("U7_CONTRACT_FILE_SET", fixtureRoot, `fixture set ${JSON.stringify(actualSet)} differs from the reviewed set ${JSON.stringify(expectedSet)}`);
  }
  const raws = new Map<string, string>();
  const docs = new Map<string, JsonObject>();
  for (const name of VALIDATOR_FILE_SET) {
    let raw: string;
    try {
      raw = await readFile(resolve(fixtureRoot, name), "utf8");
    } catch {
      add("U7_CONTRACT_FILE_MISSING", name, "reviewed fixture file is missing");
      continue;
    }
    raws.set(name, raw);
    const duplicates = duplicateJsonKeys(raw);
    if (duplicates.length > 0) {
      add("U7_CONTRACT_DUPLICATE_KEY", name, `duplicate keys: ${duplicates.join(", ")}`);
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isObject(parsed)) {
        add("U7_CONTRACT_JSON", name, "root is not an object");
        continue;
      }
      docs.set(name, parsed);
    } catch {
      add("U7_CONTRACT_JSON", name, "file does not parse as JSON");
    }
  }

  const manifest = docs.get("u7-midi-export-workflow-contract.json");
  if (manifest !== undefined && manifest["schema"] !== U7_REVIEWED_MANIFEST_SCHEMA) {
    add("U7_CONTRACT_SCHEMA", "u7-midi-export-workflow-contract.json", "manifest schema mismatch");
  }
  for (const name of U7_REVIEWED_COMPANIONS) {
    const doc = docs.get(name);
    if (doc === undefined) continue;
    if (doc["schema"] !== U7_REVIEWED_COMPANION_SCHEMAS[name]) {
      add("U7_CONTRACT_SCHEMA", name, `schema must be ${U7_REVIEWED_COMPANION_SCHEMAS[name]}`);
    }
    if (doc["expectedValuesGenerated"] !== false || doc["productionOutputUsedAsOracle"] !== false) {
      add("U7_CONTRACT_INDEPENDENCE", name, "independence flags must both be false");
    }
  }

  let reviewState = "unknown";
  let pinState = "unknown";
  let claimProduction = false;
  let claimUi = false;
  let claimHuman = false;
  let claimExpert = false;
  if (manifest !== undefined) {
    reviewState = typeof manifest["reviewState"] === "string" ? manifest["reviewState"] : "unknown";
    pinState = typeof manifest["pinState"] === "string" ? manifest["pinState"] : "unknown";
    claimProduction = manifest["productionImplementationClaim"] === true;
    claimUi = manifest["uiCompletionClaim"] === true;
    claimHuman = manifest["humanAcceptanceClaim"] === true;
    claimExpert = manifest["expertReviewClaim"] === true;
    if (reviewState !== "proposed-independent-spec") {
      add("U7_CONTRACT_VERSION", "manifest.reviewState", "reviewState must be proposed-independent-spec");
    }
    const pendingAllowed = options.allowPendingFreeze === true;
    if (pinState !== "reviewed-byte-and-semantic-pinned" && !(pendingAllowed && pinState === "pending-validator-freeze")) {
      add("U7_CONTRACT_VERSION", "manifest.pinState", "pinState must be reviewed-byte-and-semantic-pinned");
    }
    if (manifest["expectedValuesGenerated"] !== false || manifest["productionOutputUsedAsOracle"] !== false) {
      add("U7_CONTRACT_INDEPENDENCE", "manifest", "independence flags must both be false");
    }
    const contract = isObject(manifest["contract"]) ? manifest["contract"] : {};
    if (
      contract["schema"] !== U7_REVIEWED_CONTRACT_SCHEMA ||
      contract["policyId"] !== U7_REVIEWED_POLICY_ID ||
      contract["policyVersion"] !== U7_REVIEWED_POLICY_VERSION ||
      contract["implementationStatus"] !== "specified-not-implemented"
    ) {
      add("U7_CONTRACT_MANIFEST", "manifest.contract", "contract identity block mismatch");
    }
    if (manifest["beadId"] !== U7_REVIEWED_BEAD_ID || manifest["package"] !== U7_REVIEWED_PACKAGE) {
      add("U7_CONTRACT_MANIFEST", "manifest", "package or bead id mismatch");
    }
    const pins = isObject(manifest["upstreamPins"]) ? manifest["upstreamPins"] : {};
    const expectedPins: JsonObject = {
      e1WriterId: "changes.midi-export",
      e1WriterVersion: 1,
      e1WriterVersionTag: "changes.midi-export.v1",
      midiPpq: 960,
      midiTrackCount: 2,
      maxMarkerTextUtf8Bytes: 96,
      filenamePrefix: "changes-",
      filenameSuffix: ".mid",
      filenameMaxCharacters: 64,
      maxDocumentChordEvents: 8_192,
      maxDocumentSections: 64,
      maxMarkers: 8_256,
      maxArtifactBytes: 4_194_304,
      compactBreakpointCssPx: 640,
      proposedDialogKind: U7_REVIEWED_PROPOSED_DIALOG_KIND,
    };
    for (const [key, value] of Object.entries(expectedPins)) {
      if (pins[key] !== value) {
        add("U7_CONTRACT_LIMITS", `manifest.upstreamPins.${key}`, `must be ${JSON.stringify(value)}`);
      }
    }
    if (JSON.stringify(pins["existingApplicationDialogKinds"]) !== JSON.stringify([...U7_REVIEWED_EXISTING_DIALOG_KINDS])) {
      add("U7_CONTRACT_MANIFEST", "manifest.upstreamPins.existingApplicationDialogKinds", "accepted dialog kinds must be restated exactly");
    }
    const vocabChecks: [string, readonly unknown[]][] = [
      ["workflowStates", U7_REVIEWED_WORKFLOW_STATES],
      ["workflowActions", U7_REVIEWED_WORKFLOW_ACTIONS],
      ["cancelableStates", U7_REVIEWED_CANCELABLE_STATES],
      ["registryStates", U7_REVIEWED_REGISTRY_STATES],
      ["previewBlockerKinds", U7_REVIEWED_BLOCKER_KINDS],
      ["markerOmissionReasons", U7_REVIEWED_OMISSION_REASONS],
      ["titleNoticeKinds", U7_REVIEWED_TITLE_NOTICE_KINDS],
      ["deliveryOutcomes", U7_REVIEWED_DELIVERY_OUTCOMES],
      ["announcementKeys", U7_REVIEWED_ANNOUNCEMENT_KEYS],
      ["lawIds", U7_REVIEWED_LAW_IDS],
    ];
    for (const [key, expected] of vocabChecks) {
      if (JSON.stringify(manifest[key]) !== JSON.stringify([...expected])) {
        add("U7_CONTRACT_MANIFEST", `manifest.${key}`, "vocabulary must equal the restated reviewed tuple");
      }
    }
    if (manifest["staleOutcomeCode"] !== U7_REVIEWED_STALE_OUTCOME_CODE) {
      add("U7_CONTRACT_REFUSAL_CODES", "manifest.staleOutcomeCode", "stale outcome code mismatch");
    }
    if (JSON.stringify(manifest["components"]) !== JSON.stringify([...U7_REVIEWED_COMPONENTS])) {
      add("U7_CONTRACT_MANIFEST", "manifest.components", "component inventory mismatch");
    }
    const discipline = isObject(manifest["channelDiscipline"]) ? manifest["channelDiscipline"] : {};
    if (
      JSON.stringify(discipline["authorizedCommandKinds"]) !== "[]" ||
      JSON.stringify(discipline["authorizedEphemeralIntentKinds"]) !== JSON.stringify(["push-dialog", "pop-dialog"]) ||
      JSON.stringify(discipline["forbiddenEphemeralIntentKinds"]) !== JSON.stringify(["mark-exported", "set-recovery"])
    ) {
      add("U7_CONTRACT_MANIFEST", "manifest.channelDiscipline", "channel discipline mismatch");
    }
    const derivation = isObject(manifest["derivationPins"]) ? manifest["derivationPins"] : {};
    if (
      derivation["markerAccidentalStyle"] !== U7_REVIEWED_DERIVATION_PINS["markerAccidentalStyle"] ||
      derivation["titleFallback"] !== U7_REVIEWED_DERIVATION_PINS["titleFallback"] ||
      derivation["voicingTrackName"] !== U7_REVIEWED_DERIVATION_PINS["voicingTrackName"] ||
      derivation["instrumentName"] !== U7_REVIEWED_DERIVATION_PINS["instrumentName"] ||
      derivation["requestIdPrefix"] !== U7_REVIEWED_DERIVATION_PINS["requestIdPrefix"] ||
      derivation["customChordPlanCode"] !== U7_REVIEWED_DERIVATION_PINS["customChordPlanCode"] ||
      derivation["loopAlwaysNull"] !== true
    ) {
      add("U7_CONTRACT_MANIFEST", "manifest.derivationPins", "derivation pins mismatch");
    }
    const declaredDigests = isObject(manifest["companionSha256"]) ? manifest["companionSha256"] : {};
    if (pinState === "reviewed-byte-and-semantic-pinned") {
      for (const name of U7_REVIEWED_COMPANIONS) {
        const raw = raws.get(name);
        if (raw === undefined) continue;
        const actual = sha256Hex(raw);
        if (declaredDigests[name] !== actual) {
          add("U7_CONTRACT_COMPANION_HASH", `manifest.companionSha256.${name}`, "manifest byte digest does not match the companion bytes");
        }
        if (U7_REVIEWED_BYTE_DIGESTS[name] !== actual) {
          add("U7_CONTRACT_COMPANION_HASH", `validator.${name}`, "validator-reviewed byte digest does not match the companion bytes");
        }
      }
      const semanticInput = VALIDATOR_FILE_SET.map((name) => stableJson(docs.get(name) ?? null)).join("\n");
      if (sha256Hex(semanticInput) !== U7_REVIEWED_SEMANTIC_DIGEST) {
        add("U7_CONTRACT_SEMANTIC_DIGEST", "packet", "semantic digest over all seven roots mismatch");
      }
    } else if (pendingAllowed) {
      for (const name of U7_REVIEWED_COMPANIONS) {
        const raw = raws.get(name);
        if (raw === undefined) continue;
        const declared = declaredDigests[name];
        if (typeof declared === "string" && declared.length > 0 && declared !== sha256Hex(raw)) {
          add("U7_CONTRACT_COMPANION_HASH", `manifest.companionSha256.${name}`, "declared digest does not match the companion bytes");
        }
      }
    }
    runManifestSemanticOracle(docs, add);
  }

  runPreviewOracle(docs, add);
  runStateOracle(docs, add);
  runLimitOracle(docs, add);
  runTraceOracle(docs, add);
  runProvenanceOracle(docs, add);

  /* ---- mutation replay ---- */
  const oracleForFile: Record<string, (mutantDocs: PacketDocs, sink: AddFinding) => void> = {
    "preview-cases.json": runPreviewOracle,
    "state-cases.json": runStateOracle,
    "limit-cases.json": runLimitOracle,
    "trace-ledger.json": runTraceOracle,
    "provenance-ledger.json": runProvenanceOracle,
    "u7-midi-export-workflow-contract.json": runManifestSemanticOracle,
  };
  const applyPointer = (root: JsonObject, pointer: string, operator: string, to: unknown): void => {
    const segments = pointer.split("/").slice(1);
    let current: unknown = root;
    for (const segment of segments.slice(0, -1)) {
      if (Array.isArray(current)) {
        current = current[Number(segment)];
      } else if (isObject(current)) {
        current = current[segment];
      } else {
        return;
      }
    }
    const last = segments[segments.length - 1] ?? "";
    if (Array.isArray(current)) {
      if (operator === "remove") current.splice(Number(last), 1);
      else current[Number(last)] = to;
    } else if (isObject(current)) {
      if (operator === "remove") Reflect.deleteProperty(current, last);
      else current[last] = to;
    }
  };
  const resolvePointer = (root: unknown, pointer: string): unknown => {
    let current = root;
    for (const segment of pointer.split("/").slice(1)) {
      if (Array.isArray(current)) {
        current = current[Number(segment)];
      } else if (isObject(current)) {
        current = current[segment];
      } else {
        return undefined;
      }
    }
    return current;
  };

  const mutationDoc = docs.get("mutation-controls.json");
  const controls: unknown[] =
    mutationDoc !== undefined && Array.isArray(mutationDoc["controls"]) ? mutationDoc["controls"] : [];
  let replayed = 0;
  for (const control of controls) {
    if (!isObject(control)) continue;
    const id = typeof control["id"] === "string" ? control["id"] : "<unknown>";
    const targetFile = typeof control["targetFile"] === "string" ? control["targetFile"] : "";
    const mutation = isObject(control["mutation"]) ? control["mutation"] : {};
    const expectedFinding = typeof control["expectedFinding"] === "string" ? control["expectedFinding"] : "";
    const pointer = typeof mutation["jsonPointer"] === "string" ? mutation["jsonPointer"] : "";
    const operator = typeof mutation["operator"] === "string" ? mutation["operator"] : "replace";
    const original = docs.get(targetFile);
    const oracle = oracleForFile[targetFile];
    if (original === undefined || oracle === undefined) {
      add("U7_CONTRACT_MUTATION_CONTROL", id, `target file ${targetFile} unavailable`);
      continue;
    }
    const currentValue = resolvePointer(original, pointer);
    if (operator === "remove" && currentValue === undefined) {
      add("U7_CONTRACT_MUTATION_CONTROL", id, `remove target ${pointer} does not exist`);
      continue;
    }
    if (operator !== "remove" && mutation["from"] !== "PINNED" && JSON.stringify(currentValue) !== JSON.stringify(mutation["from"])) {
      add("U7_CONTRACT_MUTATION_CONTROL", id, `mutation 'from' ${JSON.stringify(mutation["from"])} does not match the packet value ${JSON.stringify(currentValue)}`);
      continue;
    }
    const mutant = JSON.parse(JSON.stringify(original)) as JsonObject;
    applyPointer(mutant, pointer, operator, mutation["to"]);
    const mutantDocs = new Map(docs);
    mutantDocs.set(targetFile, mutant);
    const sink: U7ContractFinding[] = [];
    oracle(mutantDocs, (code, path, message) => {
      sink.push(finding(code, path, message));
    });
    if (!sink.some((row) => row.code === expectedFinding)) {
      add("U7_CONTRACT_MUTATION_CONTROL", id, `mutant survived: expected ${expectedFinding}, got ${JSON.stringify(sink.map((row) => row.code))}`);
      continue;
    }
    replayed += 1;
  }

  /* ---- counts ---- */
  const declaredCounts = manifest !== undefined && isObject(manifest["counts"]) ? manifest["counts"] : {};
  const previewCases = caseList(docs, "preview-cases.json");
  const stateCases = caseList(docs, "state-cases.json");
  const limitCases = caseList(docs, "limit-cases.json");
  const traceDoc = docs.get("trace-ledger.json");
  const traces = traceDoc !== undefined && Array.isArray(traceDoc["traces"]) ? traceDoc["traces"] : [];
  const provenanceDoc = docs.get("provenance-ledger.json");
  const authorities = provenanceDoc !== undefined && Array.isArray(provenanceDoc["authorities"]) ? provenanceDoc["authorities"] : [];
  const stateDoc = docs.get("state-cases.json");
  const matrix = stateDoc !== undefined && Array.isArray(stateDoc["accessibilityMatrix"]) ? stateDoc["accessibilityMatrix"] : [];
  const actualCounts: Record<string, number> = {
    previewCases: previewCases.length,
    stateCases: stateCases.length,
    accessibilityMatrixRows: matrix.length,
    limitCases: limitCases.length,
    traces: traces.length,
    authorities: authorities.length,
    mutationControls: controls.length,
    components: U7_REVIEWED_COMPONENTS.length,
    laws: U7_REVIEWED_LAW_IDS.length,
    refusalCodes: U7_REVIEWED_REFUSAL_CODES.length,
    announcementKeys: U7_REVIEWED_ANNOUNCEMENT_KEYS.length,
  };
  for (const [key, value] of Object.entries(actualCounts)) {
    if (declaredCounts[key] !== value) {
      add("U7_CONTRACT_COUNT", `manifest.counts.${key}`, `declared ${JSON.stringify(declaredCounts[key])} but found ${String(value)}`);
    }
  }

  const sorted = [...findings].sort((a, b) => a.code.localeCompare(b.code) || a.path.localeCompare(b.path));
  return Object.freeze({
    schema: "changes.validation.u7-contract.v1",
    package: "U7",
    outcome: sorted.length === 0 ? "pass" : "fail",
    reviewState,
    pinState,
    productionImplementationClaim: claimProduction,
    uiCompletionClaim: claimUi,
    humanAcceptanceClaim: claimHuman,
    expertReviewClaim: claimExpert,
    counts: Object.freeze({
      companions: U7_REVIEWED_COMPANIONS.length,
      previewCases: previewCases.length,
      stateCases: stateCases.length,
      accessibilityMatrixRows: matrix.length,
      limitCases: limitCases.length,
      traces: traces.length,
      authorities: authorities.length,
      mutationControls: controls.length,
      mutationControlsReplayed: replayed,
    }),
    findings: Object.freeze(sorted),
  });
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

if (import.meta.main) {
  const args = process.argv.slice(2);
  const allowPendingFreeze = args.includes("--allow-pending-freeze");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const root =
    positional[0] !== undefined
      ? resolve(positional[0])
      : resolve("tests/fixtures/midi-export-workflow");
  const report = await validateU7Contract(root, { allowPendingFreeze });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.outcome !== "pass") {
    process.exitCode = 1;
  }
}
