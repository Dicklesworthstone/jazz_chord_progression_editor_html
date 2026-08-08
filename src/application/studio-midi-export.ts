/**
 * The U7 MIDI export workflow service: preview, generation, and download
 * delivery of the Standard MIDI File E1 writes for the current validated
 * chart.
 *
 * This is the production implementation of the proposed U7 packet
 * (`docs/U7_MIDI_EXPORT_WORKFLOW_CONTRACT.md`, bead
 * `jcpe-milestone-advanced-craft-ulj.11.2`). The packet's contract module is
 * sealed — imported by nothing in production — so this service owns its live
 * types and mirrors the frozen vocabulary exactly; the packet fixtures judge
 * this service's output in `tests/unit/u7-*.test.ts`.
 *
 * Laws carried by this module, each stated in the contract document:
 * - The preview pins `(documentId, revision)` at open; every later stage
 *   re-checks, and a mismatch is the `u7.revision_stale` OUTCOME, never a
 *   silent re-read and never a refusal.
 * - Blocked previews enumerate every blocker (never the first) with a chart
 *   link; the carried code is always the owning package's, verbatim.
 * - E1 never derives marker text; U7 owns derivation and omits-with-disclosure
 *   instead of truncating a marker or repairing control characters.
 * - Delivery is one object-URL download under a user gesture through a
 *   capacity-one single-use preparation registry that mirrors the accepted
 *   E0 v1 discipline; `handed-off` never claims disk persistence.
 * - MIDI export never advances the canonical export marker, never calls
 *   recovery Save, and never dispatches an A0 mutation command.
 */

import type {
  ChordEventId,
  DocumentId,
  ValidatedDocument,
} from "../domain";
import {
  exportMidi,
  MIDI_EXPORT_MARKER_SCHEMA,
  MIDI_EXPORT_REQUEST_SCHEMA,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  type MidiExportMarker,
  type MidiExportMarkerKind,
  type MidiExportRequest,
  type MidiExportResult,
} from "../export";
import {
  compileStudioPlaybackPlan,
  type StudioPlaybackRefusal,
} from "./studio-playback";
import {
  formatChordSymbol,
  realizeVoicing,
  resolveChord,
  VOICING_REQUEST_SCHEMA,
  type AutoVoicingRequest,
} from "../theory";

/* -------------------------------------------------------------------------- */
/* Ports (wired at the composition root)                                       */
/* -------------------------------------------------------------------------- */

/** The current validated document, or null when none exists. */
export type StudioMidiExportDocumentPort = () => ValidatedDocument | null;

/** The current binding truth: which revision of which document is live. */
export type StudioMidiExportBindingPort = () => Readonly<{
  documentId: DocumentId;
  revision: number;
}> | null;

/** SHA-256 lowercase hex over raw bytes; throws when unavailable. */
export type StudioMidiExportHashPort = (bytes: Uint8Array) => Promise<string>;

/** Synchronous activation start for the object-URL download. */
export type StudioMidiExportDeliveryStart = (
  request: Readonly<{
    binding: StudioMidiExportDeliveryBinding;
    privateBytes: Uint8Array;
  }>,
) => Readonly<{ completion: Promise<unknown> }>;

/* -------------------------------------------------------------------------- */
/* Live types (mirror of the frozen U7 vocabulary)                             */
/* -------------------------------------------------------------------------- */

export const STUDIO_MIDI_EXPORT_SCHEMA =
  "changes.application.u7-midi-export-workflow-contract.v1";

export type StudioMidiExportRefusalCode =
  | "u7.request_invalid"
  | "u7.document_unavailable"
  | "u7.hash_unavailable"
  | "u7.preparation_conflict"
  | "u7.preparation_missing"
  | "u7.delivery_cleanup_failed"
  | "limit.u7_preview_work_exceeded";

export type StudioMidiExportRefusal = Readonly<{
  code: StudioMidiExportRefusalCode;
  message: string;
}>;

export type StudioMidiExportBlocker = Readonly<{
  kind: "realization" | "plan" | "export" | "empty-chart";
  code: string | null;
  eventId: ChordEventId | null;
  message: string;
}>;

export type StudioMidiExportMarkerOmission = Readonly<{
  eventId: ChordEventId;
  markerKind: MidiExportMarkerKind;
  reason: "text-control-chars" | "text-over-limit" | "text-empty" | "format-refused";
  utf8ByteLength: number;
}>;

export type StudioMidiExportPreview = Readonly<{
  schema: typeof STUDIO_MIDI_EXPORT_SCHEMA;
  binding: Readonly<{ documentId: DocumentId; revision: number }>;
  readiness: "ready" | "blocked";
  blockers: readonly StudioMidiExportBlocker[];
  realization: Readonly<{
    storedManualCount: number;
    storedFrozenCount: number;
    generatedCount: number;
    externalBassEventIds: readonly ChordEventId[];
  }>;
  ppq: 960;
  trackCount: 2;
  tempoBpm: number;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  derivedMarkers: readonly MidiExportMarker[];
  losses: readonly Readonly<{
    kind: "enharmonic-spelling" | "annotation-text" | "loop-range";
    eventIds: readonly ChordEventId[];
  }>[];
  markerOmissions: readonly StudioMidiExportMarkerOmission[];
  titleNotice: Readonly<{
    kind: "title-control-chars-substituted" | "title-truncated";
    originalUtf8ByteLength: number | null;
  }> | null;
  derivedTitle: string;
  artifact: Readonly<{
    filename: string;
    byteLength: number;
    sha256: string;
    tempo: Readonly<{
      requestedBpm: number;
      encodedMicrosecondsPerQuarter: number;
      roundingErrorNumerator: number;
      roundingErrorDenominator: number;
    }>;
    noteCount: number;
    markerCount: number;
  }> | null;
}>;

export type StudioMidiExportDeliveryBinding = Readonly<{
  kind: "standard-midi-file";
  sourceDocumentId: DocumentId;
  sourceRevision: number;
  filename: string;
  byteLength: number;
  artifactSha256: string;
}>;

declare const studioMidiExportPreparationBrand: unique symbol;
export type StudioMidiExportPreparationId = number & {
  readonly [studioMidiExportPreparationBrand]: "StudioMidiExportPreparationId";
};

export type StudioMidiExportPreviewResult =
  | Readonly<{
      ok: true;
      preview: StudioMidiExportPreview;
      preparationId: StudioMidiExportPreparationId | null;
    }>
  | Readonly<{ ok: false; refusal: StudioMidiExportRefusal }>;

export type StudioMidiExportGenerateResult =
  | Readonly<{ outcome: "generated" }>
  | Readonly<{ outcome: "stale"; code: "u7.revision_stale" }>
  | Readonly<{ outcome: "refused"; refusal: StudioMidiExportRefusal }>;

export type StudioMidiExportDownloadResult =
  | Readonly<{
      outcome: "handed-off";
      cleanup: Readonly<{
        cleanup: "complete";
        objectUrlsCreated: 0 | 1;
        objectUrlsRevoked: 0 | 1;
        outstandingOwnedResources: 0;
      }>;
    }>
  | Readonly<{ outcome: "failed" }>
  | Readonly<{ outcome: "stale"; code: "u7.revision_stale" }>
  | Readonly<{ outcome: "refused"; refusal: StudioMidiExportRefusal }>;

export type StudioMidiExportAbandonResult = Readonly<{
  outcome: "abandoned" | "ignored-stale";
}>;

export type StudioMidiExportService = Readonly<{
  openPreview: () => Promise<StudioMidiExportPreviewResult>;
  generate: (
    preparationId: StudioMidiExportPreparationId,
  ) => StudioMidiExportGenerateResult;
  download: (
    preparationId: StudioMidiExportPreparationId,
  ) => Promise<StudioMidiExportDownloadResult>;
  abandon: (
    preparationId: StudioMidiExportPreparationId | null,
  ) => StudioMidiExportAbandonResult;
  inspectRegistry: () => Readonly<{
    state: "empty" | "preparing" | "ready" | "delivering";
    preparationId: StudioMidiExportPreparationId | null;
  }>;
}>;

/**
 * The frozen results the composition edge returns when a build ships without
 * the service wired: the one place besides the service itself these codes may
 * be raised, kept here so every U7 refusal code has exactly one textual owner.
 */
export function studioMidiExportUnwiredPreview(): StudioMidiExportPreviewResult {
  return Object.freeze({
    ok: false as const,
    refusal: Object.freeze({
      code: "u7.document_unavailable" as const,
      message: "This build has no MIDI export service wired.",
    }),
  });
}

export function studioMidiExportUnwiredGenerate(): StudioMidiExportGenerateResult {
  return Object.freeze({
    outcome: "refused" as const,
    refusal: Object.freeze({
      code: "u7.preparation_missing" as const,
      message: "This build has no MIDI export service wired.",
    }),
  });
}

export function studioMidiExportUnwiredDownload(): StudioMidiExportDownloadResult {
  return Object.freeze({
    outcome: "refused" as const,
    refusal: Object.freeze({
      code: "u7.preparation_missing" as const,
      message: "This build has no MIDI export service wired.",
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Derivation laws (restated from the contract document)                       */
/* -------------------------------------------------------------------------- */

const MAX_MARKER_TEXT_UTF8_BYTES = 96;
const TITLE_FALLBACK = "Untitled";
const VOICING_TRACK_NAME = "Voicings";
const INSTRUMENT_NAME = "Changes";
const REQUEST_ID_PREFIX = "u7-midi-export-";
const MAX_REQUEST_ID_ASCII_LENGTH = 128;
const MAX_PREPARATION_ID = 9_007_199_254_740_991;

const textEncoder = new TextEncoder();

function hasAsciiControl(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function deriveTitle(title: string): Readonly<{
  text: string;
  notice: StudioMidiExportPreview["titleNotice"];
}> {
  if (hasAsciiControl(title)) {
    return Object.freeze({
      text: TITLE_FALLBACK,
      notice: Object.freeze({
        kind: "title-control-chars-substituted" as const,
        originalUtf8ByteLength: null,
      }),
    });
  }
  const byteLength = textEncoder.encode(title).length;
  if (byteLength > MAX_MARKER_TEXT_UTF8_BYTES) {
    let truncated = "";
    let used = 0;
    for (const char of title) {
      const need = textEncoder.encode(char).length;
      if (used + need > MAX_MARKER_TEXT_UTF8_BYTES) break;
      truncated += char;
      used += need;
    }
    return Object.freeze({
      text: truncated,
      notice: Object.freeze({
        kind: "title-truncated" as const,
        originalUtf8ByteLength: byteLength,
      }),
    });
  }
  return Object.freeze({ text: title, notice: null });
}


function deriveRequestId(documentId: string, revision: number): string {
  const safe = documentId.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${REQUEST_ID_PREFIX}${safe}-${String(revision)}`.slice(
    0,
    MAX_REQUEST_ID_ASCII_LENGTH,
  );
}

type DerivedMarkers =
  | Readonly<{
      ok: true;
      markers: readonly MidiExportMarker[];
      omissions: readonly StudioMidiExportMarkerOmission[];
    }>
  | Readonly<{ ok: false; counter: string }>;

function deriveMarkers(document: ValidatedDocument): DerivedMarkers {
  const markers: MidiExportMarker[] = [];
  const omissions: StudioMidiExportMarkerOmission[] = [];
  let candidates = 0;
  const consider = (
    eventId: ChordEventId,
    markerKind: MidiExportMarkerKind,
    text: string | null,
  ): void => {
    candidates += 1;
    if (text === null) {
      omissions.push(
        Object.freeze({
          eventId,
          markerKind,
          reason: "format-refused" as const,
          utf8ByteLength: 0,
        }),
      );
      return;
    }
    const utf8ByteLength = textEncoder.encode(text).length;
    if (text.trim().length === 0) {
      omissions.push(
        Object.freeze({
          eventId,
          markerKind,
          reason: "text-empty" as const,
          utf8ByteLength,
        }),
      );
      return;
    }
    if (hasAsciiControl(text)) {
      omissions.push(
        Object.freeze({
          eventId,
          markerKind,
          reason: "text-control-chars" as const,
          utf8ByteLength,
        }),
      );
      return;
    }
    if (utf8ByteLength > MAX_MARKER_TEXT_UTF8_BYTES) {
      omissions.push(
        Object.freeze({
          eventId,
          markerKind,
          reason: "text-over-limit" as const,
          utf8ByteLength,
        }),
      );
      return;
    }
    markers.push(
      Object.freeze({
        schema: MIDI_EXPORT_MARKER_SCHEMA,
        kind: markerKind,
        eventId,
        text,
      }),
    );
  };
  for (const section of document.sections) {
    let firstInSection = true;
    for (const measure of section.measures) {
      for (const event of measure.events) {
        if (firstInSection) {
          consider(event.id, "section", section.name);
        }
        const chord = event.chord;
        if (chord.kind === "custom") {
          consider(event.id, "chord", chord.label);
        } else {
          const formatted = formatChordSymbol(chord, "unicode");
          consider(
            event.id,
            "chord",
            formatted.ok ? formatted.canonicalText : null,
          );
        }
        firstInSection = false;
        if (candidates > MAX_WALK_MARKER_CANDIDATES) {
          return Object.freeze({ ok: false as const, counter: "markers-derived" });
        }
      }
    }
  }
  return Object.freeze({
    ok: true as const,
    markers: Object.freeze(markers),
    omissions: Object.freeze(omissions),
  });
}

/* -------------------------------------------------------------------------- */
/* The blocked walk: enumerate every blocker, never the first                  */
/* -------------------------------------------------------------------------- */

function refusedChordLabel(
  document: ValidatedDocument,
  eventId: unknown,
): string | null {
  if (typeof eventId !== "string") return null;
  let barNumber = 0;
  for (const section of document.sections) {
    for (const measure of section.measures) {
      barNumber += 1;
      for (const event of measure.events) {
        if (event.id === eventId) {
          return `“${event.chord.sourceText}” in bar ${String(barNumber)}`;
        }
      }
    }
  }
  return null;
}

type WalkOutcome =
  | Readonly<{
      ok: true;
      blockers: readonly StudioMidiExportBlocker[];
      realization: StudioMidiExportPreview["realization"];
    }>
  | Readonly<{ ok: false; counter: string }>;

const MAX_WALK_EVENTS_VISITED = 8_192;
const MAX_WALK_MARKER_CANDIDATES = 8_256;

function walkEvents(document: ValidatedDocument): WalkOutcome {
  const blockers: StudioMidiExportBlocker[] = [];
  let storedManualCount = 0;
  let storedFrozenCount = 0;
  let generatedCount = 0;
  const externalBassEventIds: ChordEventId[] = [];
  let sawAnyEvent = false;
  let eventsVisited = 0;
  for (const section of document.sections) {
    for (const measure of section.measures) {
      for (const event of measure.events) {
        eventsVisited += 1;
        if (eventsVisited > MAX_WALK_EVENTS_VISITED) {
          return Object.freeze({ ok: false as const, counter: "events-visited" });
        }
        sawAnyEvent = true;
        const voicing = event.voicing;
        if (voicing.mode === "manual" || voicing.mode === "frozen") {
          if (voicing.mode === "manual") storedManualCount += 1;
          else storedFrozenCount += 1;
          continue;
        }
        /* auto */
        if (event.chord.kind === "custom") {
          blockers.push(
            Object.freeze({
              kind: "plan" as const,
              code: "playback.custom_voicing_missing",
              eventId: event.id,
              message: `${refusedChordLabel(document, event.id) ?? "A custom chord"} has no resolvable symbol, so there is no voicing to export.`,
            }),
          );
          continue;
        }
        const resolved = resolveChord(event.chord);
        if (!resolved.ok) {
          blockers.push(
            Object.freeze({
              kind: "realization" as const,
              code: resolved.refusal.code,
              eventId: event.id,
              message: `${refusedChordLabel(document, event.id) ?? "This chord"} could not be resolved to pitches, so the progression cannot be exported yet.`,
            }),
          );
          continue;
        }
        const realization = resolved.value.realizations[0];
        const request = Object.freeze({
          schema: VOICING_REQUEST_SCHEMA,
          kind: "auto",
          resolved: resolved.value,
          realizationId: realization.id,
          policy: voicing,
          quartalContext: null,
        }) as AutoVoicingRequest;
        const generated = realizeVoicing(request);
        if (!generated.ok) {
          blockers.push(
            Object.freeze({
              kind: "realization" as const,
              code: generated.refusal.code,
              eventId: event.id,
              message: `${refusedChordLabel(document, event.id) ?? "This chord"} has no voicing that fits its constraints, so the progression cannot be exported yet.`,
            }),
          );
          continue;
        }
        generatedCount += 1;
        if (voicing.bassPolicy === "external") {
          externalBassEventIds.push(event.id);
        }
      }
    }
  }
  if (!sawAnyEvent) {
    blockers.push(
      Object.freeze({
        kind: "empty-chart" as const,
        code: null,
        eventId: null,
        message: "There are no chords to export yet.",
      }),
    );
  }
  return Object.freeze({
    ok: true as const,
    blockers: Object.freeze(blockers),
    realization: Object.freeze({
      storedManualCount,
      storedFrozenCount,
      generatedCount,
      externalBassEventIds: Object.freeze(externalBassEventIds),
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* The service                                                                 */
/* -------------------------------------------------------------------------- */

export function createStudioMidiExport(ports: Readonly<{
  readDocument: StudioMidiExportDocumentPort;
  readBinding: StudioMidiExportBindingPort;
  hashBytes: StudioMidiExportHashPort;
  startDelivery: StudioMidiExportDeliveryStart;
}>): StudioMidiExportService {
  type RegistryState = "empty" | "preparing" | "ready" | "delivering";
  type Preparation = Readonly<{
    preparationId: StudioMidiExportPreparationId;
    documentId: DocumentId;
    revision: number;
    bytes: Uint8Array;
    binding: StudioMidiExportDeliveryBinding;
  }>;
  let registryState: RegistryState = "empty";
  let preparation: Preparation | null = null;
  let nextPreparationId = 1;

  const abandonRegistry = (): void => {
    registryState = "empty";
    preparation = null;
  };

  const allocatePreparationId = (): StudioMidiExportPreparationId | null => {
    if (nextPreparationId > MAX_PREPARATION_ID) return null;
    const allocated = nextPreparationId as StudioMidiExportPreparationId;
    nextPreparationId += 1;
    return allocated;
  };

  const openPreview = async (): Promise<StudioMidiExportPreviewResult> => {
    if (registryState !== "empty") {
      return Object.freeze({
        ok: false as const,
        refusal: Object.freeze({
          code: "u7.preparation_conflict" as const,
          message: "Another export is already being prepared; let it finish first.",
        }),
      });
    }
    registryState = "preparing";
    const finishBlocked = (
      preview: StudioMidiExportPreview,
    ): StudioMidiExportPreviewResult => {
      abandonRegistry();
      return Object.freeze({ ok: true as const, preview, preparationId: null });
    };
    const document = ports.readDocument();
    if (document === null) {
      abandonRegistry();
      return Object.freeze({
        ok: false as const,
        refusal: Object.freeze({
          code: "u7.document_unavailable" as const,
          message: "There is no chart to export right now.",
        }),
      });
    }
    const liveBinding = ports.readBinding();
    const binding = Object.freeze({
      documentId: document.id,
      revision: liveBinding?.revision ?? 0,
    });
    const walk = walkEvents(document);
    if (!walk.ok) {
      abandonRegistry();
      return Object.freeze({
        ok: false as const,
        refusal: Object.freeze({
          code: "limit.u7_preview_work_exceeded" as const,
          message: "Preview assembly exceeded its deterministic work bound; the chart is unchanged.",
        }),
      });
    }
    const title = deriveTitle(document.title);
    const baseDisclosures = {
      realization: walk.realization,
      ppq: 960 as const,
      trackCount: 2 as const,
      tempoBpm: document.tempoBpm,
      meter: document.meter,
      titleNotice: title.notice,
      derivedTitle: title.text,
    };
    if (walk.blockers.length > 0) {
      return finishBlocked(
        Object.freeze({
          schema: STUDIO_MIDI_EXPORT_SCHEMA,
          binding,
          readiness: "blocked" as const,
          blockers: walk.blockers,
          ...baseDisclosures,
          derivedMarkers: Object.freeze([]),
          losses: Object.freeze([]),
          markerOmissions: Object.freeze([]),
          artifact: null,
        }),
      );
    }
    /* plan */
    const compiled = compileStudioPlaybackPlan(document, null);
    if (!compiled.ok) {
      const refusal: StudioPlaybackRefusal = compiled.refusal;
      return finishBlocked(
        Object.freeze({
          schema: STUDIO_MIDI_EXPORT_SCHEMA,
          binding,
          readiness: "blocked" as const,
          blockers: Object.freeze([
            Object.freeze({
              kind: "plan" as const,
              code: refusal.code,
              eventId: null,
              message: refusal.message,
            }),
          ]),
          ...baseDisclosures,
          derivedMarkers: Object.freeze([]),
          losses: Object.freeze([]),
          markerOmissions: Object.freeze([]),
          artifact: null,
        }),
      );
    }
    const plan = compiled.plan;
    /* markers + export */
    const derived = deriveMarkers(document);
    if (!derived.ok) {
      abandonRegistry();
      return Object.freeze({
        ok: false as const,
        refusal: Object.freeze({
          code: "limit.u7_preview_work_exceeded" as const,
          message: "Preview assembly exceeded its deterministic work bound; the chart is unchanged.",
        }),
      });
    }
    const request: MidiExportRequest = Object.freeze({
      schema: MIDI_EXPORT_REQUEST_SCHEMA,
      requestId: deriveRequestId(document.id, binding.revision),
      writerId: MIDI_EXPORT_WRITER_ID,
      writerVersion: MIDI_EXPORT_WRITER_VERSION,
      documentId: document.id,
      sourceRevision: binding.revision,
      title: title.text,
      voicingTrackName: VOICING_TRACK_NAME,
      instrumentName: INSTRUMENT_NAME,
      markers: derived.markers,
      plan,
    });
    const exported: MidiExportResult = exportMidi(request);
    if (!exported.ok) {
      const refusal = exported.refusal;
      const pathMatch = /^\/plan\/events\/(\d+)\//.exec(
        `/${refusal.path.map((segment) => String(segment)).join("/")}`,
      );
      const linkedEventId =
        pathMatch !== null ? plan.events[Number(pathMatch[1])]?.eventId ?? null : null;
      return finishBlocked(
        Object.freeze({
          schema: STUDIO_MIDI_EXPORT_SCHEMA,
          binding,
          readiness: "blocked" as const,
          blockers: Object.freeze([
            Object.freeze({
              kind: "export" as const,
              code: refusal.code,
              eventId: linkedEventId,
              message:
                linkedEventId === null
                  ? "This file format cannot hold the chart as written; the message below says why."
                  : `${refusedChordLabel(document, linkedEventId) ?? "One chord"} cannot be written to this file format; the message below says why.`,
            }),
          ]),
          ...baseDisclosures,
          derivedMarkers: derived.markers,
          losses: Object.freeze([]),
          markerOmissions: derived.omissions,
          artifact: null,
        }),
      );
    }
    /* hash */
    let sha256: string;
    try {
      sha256 = await ports.hashBytes(exported.value.bytes);
    } catch {
      abandonRegistry();
      return Object.freeze({
        ok: false as const,
        refusal: Object.freeze({
          code: "u7.hash_unavailable" as const,
          message: "This browser could not fingerprint the file; nothing was downloaded.",
        }),
      });
    }
    const report = exported.value.report;
    const artifact = Object.freeze({
      filename: report.filename,
      byteLength: report.byteLength,
      sha256,
      tempo: Object.freeze({
        requestedBpm: report.requestedBpm,
        encodedMicrosecondsPerQuarter: report.encodedMicrosecondsPerQuarter,
        roundingErrorNumerator: report.roundingErrorNumerator,
        roundingErrorDenominator: report.roundingErrorDenominator,
      }),
      noteCount: report.noteCount,
      markerCount: report.markerCount,
    });
    const preparationId = allocatePreparationId();
    if (preparationId === null) {
      abandonRegistry();
      return Object.freeze({
        ok: false as const,
        refusal: Object.freeze({
          code: "u7.preparation_missing" as const,
          message: "This session's export counter is exhausted; reload the page.",
        }),
      });
    }
    preparation = Object.freeze({
      preparationId,
      documentId: binding.documentId,
      revision: binding.revision,
      bytes: exported.value.bytes,
      binding: Object.freeze({
        kind: "standard-midi-file" as const,
        sourceDocumentId: binding.documentId,
        sourceRevision: binding.revision,
        filename: artifact.filename,
        byteLength: artifact.byteLength,
        artifactSha256: artifact.sha256,
      }),
    });
    registryState = "ready";
    /* loss mirroring */
    const losses = report.losses.map((loss) =>
      Object.freeze({
        kind: loss.kind,
        eventIds: loss.eventIds,
      }),
    );
    return Object.freeze({
      ok: true as const,
      preview: Object.freeze({
        schema: STUDIO_MIDI_EXPORT_SCHEMA,
        binding,
        readiness: "ready" as const,
        blockers: Object.freeze([]),
        ...baseDisclosures,
        derivedMarkers: derived.markers,
        losses: Object.freeze(losses),
        markerOmissions: derived.omissions,
        artifact,
      }),
      preparationId,
    });
  };

  const bindingIsStale = (prepared: Preparation): boolean => {
    const live = ports.readBinding();
    return (
      live === null ||
      live.documentId !== prepared.documentId ||
      live.revision !== prepared.revision
    );
  };

  const generate = (
    preparationId: StudioMidiExportPreparationId,
  ): StudioMidiExportGenerateResult => {
    if (
      registryState !== "ready" ||
      preparation === null ||
      preparation.preparationId !== preparationId
    ) {
      return Object.freeze({
        outcome: "refused" as const,
        refusal: Object.freeze({
          code: "u7.preparation_missing" as const,
          message: "There is no prepared file to generate; open the preview again.",
        }),
      });
    }
    if (bindingIsStale(preparation)) {
      abandonRegistry();
      return Object.freeze({
        outcome: "stale" as const,
        code: "u7.revision_stale" as const,
      });
    }
    return Object.freeze({ outcome: "generated" as const });
  };

  const download = async (
    preparationId: StudioMidiExportPreparationId,
  ): Promise<StudioMidiExportDownloadResult> => {
    if (
      registryState !== "ready" ||
      preparation === null ||
      preparation.preparationId !== preparationId
    ) {
      return Object.freeze({
        outcome: "refused" as const,
        refusal: Object.freeze({
          code: "u7.preparation_missing" as const,
          message: "The file was already taken; generate it again to download once more.",
        }),
      });
    }
    if (bindingIsStale(preparation)) {
      abandonRegistry();
      return Object.freeze({
        outcome: "stale" as const,
        code: "u7.revision_stale" as const,
      });
    }
    const held = preparation;
    registryState = "delivering";
    let started: Readonly<{ completion: Promise<unknown> }>;
    try {
      started = ports.startDelivery(
        Object.freeze({
          binding: held.binding,
          privateBytes: held.bytes,
        }),
      );
    } catch {
      registryState = "ready";
      return Object.freeze({ outcome: "failed" as const });
    }
    let completionValue: unknown;
    try {
      completionValue = await started.completion;
    } catch {
      registryState = "ready";
      return Object.freeze({ outcome: "failed" as const });
    }
    /*
     * The coordinator validates the unknown completion (accepted E0 idiom):
     * exactly one created and one revoked object URL with nothing outstanding
     * is the only acceptable accounting for this channel.
     */
    const accounting = completionValue as
      | Readonly<{
          objectUrlsCreated?: unknown;
          objectUrlsRevoked?: unknown;
          outstandingOwnedResources?: unknown;
        }>
      | null;
    const cleanupComplete =
      accounting !== null &&
      typeof accounting === "object" &&
      accounting.objectUrlsCreated === 1 &&
      accounting.objectUrlsRevoked === 1 &&
      accounting.outstandingOwnedResources === 0;
    if (!cleanupComplete) {
      abandonRegistry();
      return Object.freeze({
        outcome: "refused" as const,
        refusal: Object.freeze({
          code: "u7.delivery_cleanup_failed" as const,
          message:
            "The download reached the browser but its cleanup could not be proven; no retry is needed, and the chart is unchanged.",
        }),
      });
    }
    abandonRegistry();
    return Object.freeze({
      outcome: "handed-off" as const,
      cleanup: Object.freeze({
        cleanup: "complete" as const,
        objectUrlsCreated: 1 as const,
        objectUrlsRevoked: 1 as const,
        outstandingOwnedResources: 0 as const,
      }),
    });
  };

  const abandon = (
    preparationId: StudioMidiExportPreparationId | null,
  ): StudioMidiExportAbandonResult => {
    if (
      registryState === "empty" ||
      preparationId === null ||
      preparation === null ||
      preparation.preparationId !== preparationId
    ) {
      return Object.freeze({ outcome: "ignored-stale" as const });
    }
    abandonRegistry();
    return Object.freeze({ outcome: "abandoned" as const });
  };

  return Object.freeze({
    openPreview,
    generate,
    download,
    abandon,
    inspectRegistry: () =>
      Object.freeze({
        state: registryState,
        preparationId: preparation?.preparationId ?? null,
      }),
  });
}
