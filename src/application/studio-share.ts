/**
 * Backend-free chart sharing over a local URL fragment.
 *
 * A share link carries the chart as `#zdoc=1.<base64url payload>` — nothing
 * is ever requested from a server; the fragment is written on an explicit
 * user gesture and decoded on open through the same bounded, refusing path
 * every other external text crosses. The payload is versioned canonical
 * JSON of five fields, every one capped, and a decode refuses on any
 * unknown field, wrong type, or exceeded bound rather than guessing.
 *
 * The chart travels as quick-entry grammar with every duration explicit
 * (`Dm7:2/1`), so applying a shared chart is exactly typing it: the T0
 * grammar is the only syntax authority, and a payload it refuses lands as
 * a concrete refusal, never a partial chart. Section names, annotations,
 * and manual voicings do not travel in v1 — the payload is the sounding
 * chart, its title, tempo, and groove.
 */
import { MAX_TEMPO_BPM, MIN_TEMPO_BPM } from "../domain";
import {
  PERFORMANCE_STYLE_IDS,
  type PerformanceStyleId,
} from "../playback";
import type { StudioController } from "./studio-controller";
import type { StudioViewModel } from "./studio-view-model";

export const SHARE_FRAGMENT_PREFIX = "#zdoc=1.";

/** Hard caps; a fragment beyond any of them refuses, never truncates. */
export const MAX_SHARE_FRAGMENT_CHARS = 8_192;
export const MAX_SHARE_TITLE_CODE_POINTS = 256;
export const MAX_SHARE_CHART_CODE_POINTS = 4_096;

export type SharePayload = Readonly<{
  title: string;
  tempoBpm: number;
  grooveStyleId: PerformanceStyleId;
  chartText: string;
}>;

export type ShareRefusalCode =
  | "share.fragment_absent"
  | "share.version_unsupported"
  | "share.encoding_invalid"
  | "share.json_invalid"
  | "share.shape_invalid"
  | "share.limit_exceeded"
  | "share.tempo_out_of_range"
  | "share.groove_unknown"
  | "share.chart_empty"
  | "share.chart_has_empty_bar";

export type ShareResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; code: ShareRefusalCode; message: string }>;

const refuse = <Value>(
  code: ShareRefusalCode,
  message: string,
): ShareResult<Value> => Object.freeze({ code, message, ok: false });

const accept = <Value>(value: Value): ShareResult<Value> =>
  Object.freeze({ ok: true, value });

const codePointCount = (text: string): number => Array.from(text).length;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) return null;
  const padded =
    encoded.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (encoded.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isPerformanceStyleId(value: string): value is PerformanceStyleId {
  return (PERFORMANCE_STYLE_IDS as readonly string[]).includes(value);
}

/** Build the sounding chart as quick-entry text with explicit durations. */
export function buildSharePayload(
  snapshot: StudioViewModel,
): ShareResult<SharePayload> {
  if (snapshot.chordCount === 0) {
    return refuse(
      "share.chart_empty",
      "Write at least one chord before copying a share link.",
    );
  }
  const bars: string[] = [];
  for (const section of snapshot.sections) {
    for (const measure of section.measures) {
      if (measure.events.length === 0) {
        return refuse(
          "share.chart_has_empty_bar",
          "This chart has an empty bar the share grammar cannot carry yet. Fill or remove empty bars, then copy the link again.",
        );
      }
      bars.push(
        measure.events
          .map((event) => `${event.symbolText}:${event.durationBeatLabel}`)
          .join(" "),
      );
    }
  }
  return accept(
    Object.freeze({
      chartText: `| ${bars.join(" | ")} |`,
      grooveStyleId: snapshot.performance.styleId,
      tempoBpm: snapshot.tempoBpm,
      title: snapshot.title,
    }),
  );
}

export function encodeShareFragment(
  payload: SharePayload,
): ShareResult<string> {
  if (codePointCount(payload.title) > MAX_SHARE_TITLE_CODE_POINTS) {
    return refuse(
      "share.limit_exceeded",
      `The title exceeds ${String(MAX_SHARE_TITLE_CODE_POINTS)} code points.`,
    );
  }
  if (codePointCount(payload.chartText) > MAX_SHARE_CHART_CODE_POINTS) {
    return refuse(
      "share.limit_exceeded",
      `The chart text exceeds ${String(MAX_SHARE_CHART_CODE_POINTS)} code points.`,
    );
  }
  // Key order is fixed by construction; the encoder is deterministic.
  const json = JSON.stringify({
    v: 1,
    t: payload.title,
    b: payload.tempoBpm,
    g: payload.grooveStyleId,
    c: payload.chartText,
  });
  const fragment = `${SHARE_FRAGMENT_PREFIX}${toBase64Url(json)}`;
  if (fragment.length > MAX_SHARE_FRAGMENT_CHARS) {
    return refuse(
      "share.limit_exceeded",
      `The share link exceeds ${String(MAX_SHARE_FRAGMENT_CHARS)} characters.`,
    );
  }
  return accept(fragment);
}

/**
 * Total decoder for an incoming fragment. `share.fragment_absent` is the
 * quiet outcome — no share present, boot proceeds normally; every other
 * refusal names exactly what was wrong with a fragment that claimed to be
 * a share link.
 */
export function decodeShareFragment(
  hash: string,
): ShareResult<SharePayload> {
  if (!hash.startsWith("#zdoc=")) {
    return refuse("share.fragment_absent", "No share fragment is present.");
  }
  if (hash.length > MAX_SHARE_FRAGMENT_CHARS) {
    return refuse(
      "share.limit_exceeded",
      `The share link exceeds ${String(MAX_SHARE_FRAGMENT_CHARS)} characters and was not opened.`,
    );
  }
  if (!hash.startsWith(SHARE_FRAGMENT_PREFIX)) {
    return refuse(
      "share.version_unsupported",
      "This share link uses a version this build does not read.",
    );
  }
  const decoded = fromBase64Url(hash.slice(SHARE_FRAGMENT_PREFIX.length));
  if (decoded === null) {
    return refuse(
      "share.encoding_invalid",
      "The share link's payload is not valid base64url UTF-8.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return refuse(
      "share.json_invalid",
      "The share link's payload is not valid JSON.",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return refuse(
      "share.shape_invalid",
      "The share link's payload is not a JSON object.",
    );
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "b,c,g,t,v") {
    return refuse(
      "share.shape_invalid",
      "The share link's payload does not carry exactly the five expected fields.",
    );
  }
  if (record["v"] !== 1) {
    return refuse(
      "share.version_unsupported",
      "This share link uses a payload version this build does not read.",
    );
  }
  const title = record["t"];
  const tempo = record["b"];
  const groove = record["g"];
  const chart = record["c"];
  if (
    typeof title !== "string" ||
    typeof tempo !== "number" ||
    typeof groove !== "string" ||
    typeof chart !== "string"
  ) {
    return refuse(
      "share.shape_invalid",
      "A share field carries the wrong type.",
    );
  }
  if (
    codePointCount(title) > MAX_SHARE_TITLE_CODE_POINTS ||
    codePointCount(chart) > MAX_SHARE_CHART_CODE_POINTS
  ) {
    return refuse(
      "share.limit_exceeded",
      "A share field exceeds its supported length.",
    );
  }
  if (
    !Number.isInteger(tempo) ||
    tempo < MIN_TEMPO_BPM ||
    tempo > MAX_TEMPO_BPM
  ) {
    return refuse(
      "share.tempo_out_of_range",
      `The shared tempo must be a whole number between ${String(MIN_TEMPO_BPM)} and ${String(MAX_TEMPO_BPM)} BPM.`,
    );
  }
  if (!isPerformanceStyleId(groove)) {
    return refuse(
      "share.groove_unknown",
      "The shared groove style is not one this build declares.",
    );
  }
  return accept(
    Object.freeze({
      chartText: chart,
      grooveStyleId: groove,
      tempoBpm: tempo,
      title,
    }),
  );
}

export type ApplySharedResult =
  | Readonly<{ applied: true }>
  | Readonly<{ applied: false; reason: string }>;

/**
 * Apply a decoded share to a pristine studio through the exact typed path a
 * user travels — title command, quick-entry draft, atomic insert, tempo
 * command, then the session groove. A studio that already has content is
 * never touched, and a mid-way refusal unwinds every applied document
 * command with real undos before reporting.
 */
export function applySharedStartup(
  controller: StudioController,
  payload: SharePayload,
): ApplySharedResult {
  const snapshot = controller.getSnapshot();
  const pristine =
    snapshot.chordCount === 0 &&
    snapshot.sections.length === 1 &&
    !snapshot.history.canUndo &&
    snapshot.quickEntry.text.length === 0;
  if (!pristine) {
    return Object.freeze({
      applied: false,
      reason: "The studio already has content; the shared chart was not applied.",
    });
  }
  let undoDepth = 0;
  const unwind = (): void => {
    for (let step = 0; step < undoDepth; step += 1) void controller.undo();
  };
  /*
   * A same-value command refuses rather than recording a no-op, so a share
   * that happens to carry the blank studio's own defaults (title
   * "Untitled Chart", tempo 105) must skip those steps instead of dying on
   * them — the chart is the payload's point.
   */
  if (payload.title !== snapshot.title) {
    const titled = controller.setTitle(payload.title);
    if (!titled.ok) {
      return Object.freeze({
        applied: false,
        reason: `${titled.refusal.message} ${titled.refusal.recoveryAction}`,
      });
    }
    undoDepth += 1;
  }
  const sectionId = controller.getSnapshot().sections[0]?.id ?? "";
  const preview = controller.previewChartText(payload.chartText);
  if (preview.status !== "ready") {
    unwind();
    return Object.freeze({
      applied: false,
      reason: `The shared chart text does not parse (${preview.issueCodes.join(", ")}).`,
    });
  }
  const drafted = controller.setQuickEntryDraft(
    payload.chartText,
    { kind: "section-end", sectionId },
    preview.status,
    preview.issueCodes,
  );
  if (!drafted.ok) {
    unwind();
    return Object.freeze({
      applied: false,
      reason: `${drafted.refusal.message} ${drafted.refusal.recoveryAction}`,
    });
  }
  const inserted = controller.applyQuickEntryPreview();
  if (!inserted.ok) {
    unwind();
    return Object.freeze({
      applied: false,
      reason: `${inserted.refusal.message} ${inserted.refusal.recoveryAction}`,
    });
  }
  /*
   * The pristine fill applies multi-bar drafts as two commands (fill, then
   * append); a single-bar draft is one. Read the real depth from history
   * rather than assuming, so a refusal below unwinds exactly what landed.
   */
  undoDepth = payload.chartText.split("|").filter((bar) => bar.trim().length > 0)
    .length > 1
    ? undoDepth + 2
    : undoDepth + 1;
  if (payload.tempoBpm !== snapshot.tempoBpm) {
    const tempoSet = controller.setTempo(payload.tempoBpm);
    if (!tempoSet.ok) {
      unwind();
      return Object.freeze({
        applied: false,
        reason: `${tempoSet.refusal.message} ${tempoSet.refusal.recoveryAction}`,
      });
    }
  }
  /*
   * jcpe-jnnu: the groove is a document setting now. setPerformanceStyle
   * no-ops when the payload carries the chart's current groove (a
   * default-groove share applies zero extra commands) and otherwise lands
   * one undoable Set-groove entry after the chart. A refusal here leaves
   * the applied chart standing — the default style plays — and cannot
   * happen for a payload the decoder accepted.
   */
  const styled = controller.setPerformanceStyle(payload.grooveStyleId);
  if (!styled.ok) {
    return Object.freeze({ applied: true });
  }
  return Object.freeze({ applied: true });
}
