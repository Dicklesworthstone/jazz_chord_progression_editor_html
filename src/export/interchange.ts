import { compareDomainPaths, type DomainPath } from "../domain";
import {
  CANONICAL_JSON_FILENAME_EXTENSION,
  LEAD_SHEET_TEXT_ARTIFACT_SCHEMA,
  LEAD_SHEET_TEXT_FILENAME_EXTENSION,
  LEAD_SHEET_TEXT_LOSS_REPORT_SCHEMA,
  LEAD_SHEET_TEXT_LOSS_CODES,
  LEAD_SHEET_TEXT_MEDIA_TYPE,
  LEAD_SHEET_TEXT_EXPORT_POLICY_ID,
  LEAD_SHEET_TEXT_EXPORT_POLICY_VERSION,
  MAX_LEAD_SHEET_TEXT_EXPORT_BYTES,
  MAX_LEAD_SHEET_TEXT_LOSS_ITEMS,
  type CanonicalJsonExportDependencies,
  type CreateE0ExportOperations,
  type DeliverExportArtifact,
  type E0ExportCompositionDependencies,
  type ExportDeliveryArtifactBinding,
  type ExportDeliveryRequest,
  type ExportDeliveryResult,
  type ObjectUrlCleanupFailure,
  type InterchangeExportOperations,
  type LeadSheetTextArtifact,
  type LeadSheetTextExportDependencies,
  type LeadSheetTextExportResult,
  type LeadSheetTextLossCode,
  type LeadSheetTextLossItem,
  type LeadSheetTextLossReport,
  type PrepareCanonicalJsonExport,
  type PrepareCanonicalJsonExportRequest,
  type PrepareLeadSheetTextExport,
  type PrepareLeadSheetTextExportRequest,
  type PreparedExportDeliveryRequest,
  type PreparedExportDeliveryStart,
  type StartPreparedExportDelivery,
  CANONICAL_JSON_MEDIA_TYPE,
} from "./interchange-contract";

/*
 * Canonical-JSON codec, filename law, and coordinator live in
 * ./interchange-json (l3a.8.2 stage 1): that implementation is the one
 * proven byte-identical against the reviewed goldens — the serializer
 * this module first carried collapsed degree arrays to compact form and
 * broke nested-golden byte identity (caught 2026-09-03 by the golden
 * conformance suite). The names below stay for existing callers.
 */
export {
  sanitizeExportFilename,
  serializeCanonicalDocument as serializeCanonicalJsonDocument,
} from "./interchange-json";
import { prepareCanonicalJsonExport } from "./interchange-json";

export function createCanonicalJsonExportCoordinator(
  dependencies: CanonicalJsonExportDependencies,
): PrepareCanonicalJsonExport {
  return (request: PrepareCanonicalJsonExportRequest) =>
    prepareCanonicalJsonExport(request, dependencies);
}

function formatDuration(num: number, den: number): string {
  if (den === 1) return `:${String(num)}`;
  return `:${String(num)}/${String(den)}`;
}

export function createLeadSheetTextExportCoordinator(
  dependencies: LeadSheetTextExportDependencies,
): PrepareLeadSheetTextExport {
  return (
    request: PrepareLeadSheetTextExportRequest,
  ): LeadSheetTextExportResult => {
    const doc = request.document;

    if (doc.sections.length === 0) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.text.document_empty",
          path: Object.freeze(["sections"] as const),
        }),
      });
    }

    for (const [sIdx, sec] of doc.sections.entries()) {
      if (sec.measures.length === 0) {
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "export.text.section_empty",
            path: Object.freeze(["sections", sIdx, "measures"] as const),
          }),
        });
      }
      for (const [mIdx, meas] of sec.measures.entries()) {
        if (
          meas.completion.kind === "pickup" ||
          meas.completion.kind === "incomplete"
        ) {
          return Object.freeze({
            ok: false,
            refusal: Object.freeze({
              code: "export.text.measure_completion_unsupported",
              path: Object.freeze([
                "sections",
                sIdx,
                "measures",
                mIdx,
                "completion",
              ] as const),
              completion: meas.completion.kind,
            }),
          });
        }
        for (const [eIdx, ev] of meas.events.entries()) {
          if (ev.chord.kind === "custom") {
            return Object.freeze({
              ok: false,
              refusal: Object.freeze({
                code: "export.text.custom_chord_unsupported",
                path: Object.freeze([
                  "sections",
                  sIdx,
                  "measures",
                  mIdx,
                  "events",
                  eIdx,
                  "chord",
                ] as const),
              }),
            });
          }
        }
      }
    }

    // Format text lines
    const lines: string[] = [];
    lines.push(`@title ${JSON.stringify(doc.title)}`);
    lines.push(`@description ${JSON.stringify(doc.description)}`);
    lines.push(
      `@meter ${String(doc.meter.beatsPerBar)}/${String(doc.meter.beatUnit)}`,
    );
    lines.push(`@tempo ${String(doc.tempoBpm)}`);

    if (doc.key !== null) {
      const alterStr =
        doc.key.tonic.alter === 0
          ? ""
          : doc.key.tonic.alter === 1
            ? "#"
            : doc.key.tonic.alter === -1
              ? "b"
              : doc.key.tonic.alter > 1
                ? "#".repeat(doc.key.tonic.alter)
                : "b".repeat(Math.abs(doc.key.tonic.alter));
      lines.push(`@key ${doc.key.tonic.step}${alterStr} ${doc.key.mode}`);
    }

    const lossItems: LeadSheetTextLossItem[] = [];
    const countsByCode: Record<LeadSheetTextLossCode, number> = {
      "text.loss.stable_identities": 0,
      "text.loss.playback_settings": 0,
      "text.loss.derived_analysis": 0,
      "text.loss.section_key_override": 0,
      "text.loss.section_voice_leading_boundary": 0,
      "text.loss.source_symbol_alias": 0,
      "text.loss.auto_voicing_policy": 0,
      "text.loss.manual_voicing": 0,
      "text.loss.frozen_voicing": 0,
    };

    const addLoss = (code: LeadSheetTextLossCode, path: DomainPath): void => {
      lossItems.push(Object.freeze({ code, path }));
      countsByCode[code] += 1;
    };

    addLoss("text.loss.stable_identities", Object.freeze([] as const));
    addLoss("text.loss.playback_settings", Object.freeze(["playback"] as const));
    if (request.contextualAnalysis === "present") {
      addLoss("text.loss.derived_analysis", Object.freeze([] as const));
    }

    for (const [sIdx, sec] of doc.sections.entries()) {
      if (sec.keyOverride !== null) {
        addLoss(
          "text.loss.section_key_override",
          Object.freeze(["sections", sIdx, "keyOverride"] as const),
        );
      }
      if (sec.voiceLeadingBoundary !== "reset") {
        addLoss(
          "text.loss.section_voice_leading_boundary",
          Object.freeze(["sections", sIdx, "voiceLeadingBoundary"] as const),
        );
      }

      const escapedName = sec.name.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
      const secHeader =
        sec.annotation.length > 0
          ? `[${escapedName}] ${JSON.stringify(sec.annotation)}`
          : `[${escapedName}]`;
      lines.push(secHeader);
      const sectionBars: string[] = [];

      let prevCanonicalChordText: string | null = null;

      for (const [mIdx, meas] of sec.measures.entries()) {
        const eventTokens: string[] = [];

        for (const [eIdx, ev] of meas.events.entries()) {
          if (ev.chord.kind !== "parsed") {
            continue;
          }
          const parsedChord = ev.chord;
          const formatRes = dependencies.formatChordSymbol(
            parsedChord,
            request.accidentalStyle,
          );
          if (!formatRes.ok) {
            return Object.freeze({
              ok: false,
              refusal: Object.freeze({
                code: "export.text_format_failed",
                path: Object.freeze([] as const),
                diagnostics: formatRes.diagnostics,
              }),
            });
          }
          const formattedChord = formatRes.canonicalText;

          if (parsedChord.sourceText !== formattedChord) {
            addLoss(
              "text.loss.source_symbol_alias",
              Object.freeze([
                "sections",
                sIdx,
                "measures",
                mIdx,
                "events",
                eIdx,
                "chord",
                "sourceText",
              ] as const),
            );
          }

          if (ev.voicing.mode === "auto") {
            addLoss(
              "text.loss.auto_voicing_policy",
              Object.freeze([
                "sections",
                sIdx,
                "measures",
                mIdx,
                "events",
                eIdx,
                "voicing",
              ] as const),
            );
          } else if (ev.voicing.mode === "manual") {
            addLoss(
              "text.loss.manual_voicing",
              Object.freeze([
                "sections",
                sIdx,
                "measures",
                mIdx,
                "events",
                eIdx,
                "voicing",
              ] as const),
            );
          } else {
            addLoss(
              "text.loss.frozen_voicing",
              Object.freeze([
                "sections",
                sIdx,
                "measures",
                mIdx,
                "events",
                eIdx,
                "voicing",
              ] as const),
            );
          }

          let chordToken: string;
          // T0 v1 repeats cannot carry annotations. Preserve annotated repeats
          // as literal chords instead of emitting syntax T0 must reject.
          if (
            prevCanonicalChordText !== null &&
            prevCanonicalChordText === formattedChord && ev.annotation.length === 0
          ) {
            chordToken = "/";
          } else {
            chordToken = formattedChord;
            prevCanonicalChordText = formattedChord;
          }

          const durToken = formatDuration(
            ev.duration.numerator,
            ev.duration.denominator,
          );
          let token = `${chordToken}${durToken}`;
          if (ev.annotation.length > 0) {
            token += ` ${JSON.stringify(ev.annotation)}`;
          }
          eventTokens.push(token);
        }

        /* T0's canonical layout joins every measure of a section on ONE
         * line with a shared closing bar (verified against the parser's
         * own canonicalText for the reviewed goldens, 2026-09-03): a
         * one-measure-per-line emission round-trips semantically but is
         * not the canonical bytes. */
        sectionBars.push(
          eventTokens.length > 0 ? eventTokens.join(" ") : "",
        );
      }
      if (sectionBars.length > 0) {
        /* An empty measure's canonical form is a single space between its
         * bars ("| |", probed against the T0 parser's canonicalText). */
        lines.push(
          `|${sectionBars.map((bar) => (bar === "" ? " " : ` ${bar} `)).join("|")}|`,
        );
      }
    }

    lines.push("");
    const text = lines.join("\n");
    const encoded = new TextEncoder().encode(text);
    const byteLength = encoded.byteLength;

    if (byteLength > MAX_LEAD_SHEET_TEXT_EXPORT_BYTES) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.text_bytes_exceeded",
          path: Object.freeze([] as const),
          received: byteLength,
          maximum: MAX_LEAD_SHEET_TEXT_EXPORT_BYTES,
        }),
      });
    }

    if (lossItems.length > MAX_LEAD_SHEET_TEXT_LOSS_ITEMS) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.text_loss_items_exceeded",
          path: Object.freeze([] as const),
          received: lossItems.length,
          maximum: MAX_LEAD_SHEET_TEXT_LOSS_ITEMS,
        }),
      });
    }

    const parseResult = dependencies.parseChartText(
      text,
      { mode: "document" },
      request.accidentalStyle,
    );
    if (!parseResult.ok) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.text_round_trip_parse_failed",
          path: Object.freeze([] as const),
          diagnostics: parseResult.diagnostics,
        }),
      });
    }

    const projectionEquals = dependencies.supportedDocumentProjectionEquals(
      doc,
      parseResult.draft,
    );
    if (!projectionEquals) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.text_round_trip_projection_mismatch",
          path: Object.freeze([] as const),
        }),
      });
    }

    const sanitized = dependencies.sanitizeExportFilename(
      doc.title,
      "lead-sheet-text",
    );

    lossItems.sort((left, right) => compareDomainPaths(left.path, right.path) ||
      LEAD_SHEET_TEXT_LOSS_CODES.indexOf(left.code) - LEAD_SHEET_TEXT_LOSS_CODES.indexOf(right.code));
    const lossReport: LeadSheetTextLossReport = Object.freeze({
      schema: LEAD_SHEET_TEXT_LOSS_REPORT_SCHEMA,
      policyId: LEAD_SHEET_TEXT_EXPORT_POLICY_ID,
      policyVersion: LEAD_SHEET_TEXT_EXPORT_POLICY_VERSION,
      items: Object.freeze(lossItems),
      countsByCode: Object.freeze(countsByCode),
    });

    const artifact: LeadSheetTextArtifact = Object.freeze({
      schema: LEAD_SHEET_TEXT_ARTIFACT_SCHEMA,
      kind: "lead-sheet-text",
      mediaType: LEAD_SHEET_TEXT_MEDIA_TYPE,
      filename: sanitized.filename,
      text,
      byteLength,
      sourceDocumentId: doc.id,
      lossReport,
    });

    return Object.freeze({ ok: true, value: artifact });
  };
}

export const deliverExportArtifact: DeliverExportArtifact = async (
  request: ExportDeliveryRequest,
): Promise<ExportDeliveryResult> => {
  const artifact = request.artifact;
  const binding: ExportDeliveryArtifactBinding =
    artifact.kind === "canonical-json"
      ? Object.freeze({
          kind: "canonical-json" as const,
          sourceDocumentId: artifact.sourceDocumentId,
          filename: artifact.filename,
          byteLength: artifact.byteLength,
          semanticDocumentHash: artifact.semanticDocumentHash,
        })
      : Object.freeze({
          kind: "lead-sheet-text" as const,
          sourceDocumentId: artifact.sourceDocumentId,
          filename: artifact.filename,
          byteLength: artifact.byteLength,
          semanticDocumentHash: null,
        });

  const bytes = new TextEncoder().encode(artifact.text);
  const g = globalThis as unknown as {
    window?: {
      showSaveFilePicker?: (opts: unknown) => Promise<{
        createWritable: () => Promise<{
          write: (data: Uint8Array) => Promise<void>;
          close: () => Promise<void>;
          abort?: () => Promise<void>;
        }>;
      }>;
    };
    showSaveFilePicker?: (opts: unknown) => Promise<{
      createWritable: () => Promise<{
        write: (data: Uint8Array) => Promise<void>;
        close: () => Promise<void>;
        abort?: () => Promise<void>;
      }>;
    }>;
    document?: {
      createElement: (tag: string) => {
        href: string;
        download: string;
        style: { display: string };
        click: () => void;
      };
      body: {
        appendChild: (el: unknown) => void;
        removeChild: (el: unknown) => void;
      };
    };
    URL?: {
      createObjectURL: (blob: Blob) => string;
      revokeObjectURL: (url: string) => void;
    };
    Blob?: typeof Blob;
  };

  // File System Access API path
  const picker = g.showSaveFilePicker ?? g.window?.showSaveFilePicker;
  if (
    request.preference === "prefer-file-system-access" &&
    typeof picker === "function"
  ) {
    try {
      const fileHandle = await picker({
        suggestedName: artifact.filename,
        types: [
          {
            description:
              artifact.kind === "canonical-json"
                ? "Changes Progression JSON"
                : "Changes Lead Sheet Text",
            accept: {
              /* split() always yields at least one element; ?? satisfies
               * noUncheckedIndexedAccess without an assertion. */
              [artifact.mediaType.split(";")[0] ?? artifact.mediaType]: [
                artifact.kind === "canonical-json"
                  ? CANONICAL_JSON_FILENAME_EXTENSION
                  : LEAD_SHEET_TEXT_FILENAME_EXTENSION,
              ],
            },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();

      return Object.freeze({
        ok: true,
        outcome: "completed",
        channel: "file-system-access",
        bytesOffered: bytes.byteLength,
        artifact: binding,
        cleanup: "complete",
        objectUrlsCreated: 0,
        objectUrlsRevoked: 0,
        outstandingOwnedResources: 0,
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"))
      ) {
        return Object.freeze({
          ok: true,
          outcome: "cancelled",
          channel: "file-system-access",
          artifact: binding,
          cleanup: "complete",
          objectUrlsCreated: 0,
          objectUrlsRevoked: 0,
          outstandingOwnedResources: 0,
        });
      }
      return Object.freeze({
        ok: false,
        outcome: "failed",
        code: "export.delivery_write_failed",
        channel: "file-system-access",
        artifact: binding,
        cleanup: "complete",
        objectUrlsCreated: 0,
        objectUrlsRevoked: 0,
        outstandingOwnedResources: 0,
      });
    }
  }

  // Object URL Download path
  const doc = g.document;
  const urlApi = g.URL;
  const BlobCtor = g.Blob;
  if (
    doc !== undefined &&
    urlApi !== undefined &&
    typeof urlApi.createObjectURL === "function" &&
    BlobCtor !== undefined
  ) {
    let objectUrl: string | null = null;
    try {
      const blob = new BlobCtor([bytes], { type: artifact.mediaType });
      objectUrl = urlApi.createObjectURL(blob);

      const anchor = doc.createElement("a");
      anchor.href = objectUrl;
      anchor.download = artifact.filename;
      anchor.style.display = "none";
      doc.body.appendChild(anchor);
      anchor.click();
      doc.body.removeChild(anchor);

      urlApi.revokeObjectURL(objectUrl);

      return Object.freeze({
        ok: true,
        outcome: "handed-off",
        channel: "object-url-download",
        bytesOffered: bytes.byteLength,
        artifact: binding,
        cleanup: "complete",
        objectUrlsCreated: 1,
        objectUrlsRevoked: 1,
        outstandingOwnedResources: 0,
      });
    } catch {
      if (objectUrl !== null) {
        try {
          urlApi.revokeObjectURL(objectUrl);
        } catch {
          // Cleanup error handling
        }
      }
      return Object.freeze({
        ok: false,
        outcome: "failed",
        code: "export.delivery_activation_failed",
        channel: "object-url-download",
        artifact: binding,
        cleanup: "complete",
        objectUrlsCreated: 1,
        objectUrlsRevoked: 1,
        outstandingOwnedResources: 0,
      });
    }
  }

  return Object.freeze({
    ok: false,
    outcome: "failed",
    code: "export.delivery_capability_failed",
    channel: null,
    artifact: binding,
    cleanup: "complete",
    objectUrlsCreated: 0,
    objectUrlsRevoked: 0,
    outstandingOwnedResources: 0,
  });
};

export const createE0ExportOperations: CreateE0ExportOperations = (
  dependencies: E0ExportCompositionDependencies,
): InterchangeExportOperations => {
  return Object.freeze({
    prepareCanonicalJsonExport: createCanonicalJsonExportCoordinator(
      dependencies.canonicalJson,
    ),
    prepareLeadSheetTextExport: createLeadSheetTextExportCoordinator(
      dependencies.leadSheetText,
    ),
    sanitizeExportFilename: dependencies.canonicalJson.sanitizeExportFilename,
    deliverExportArtifact,
  });
};

/* ------------------------------------------------------------------ */
/* Section-10 activation-safe start primitive                          */
/* ------------------------------------------------------------------ */

type BrowserDeliveryGlobals = Readonly<{
  navigator?: Readonly<{ userActivation?: Readonly<{ isActive?: boolean }> }>;
  showSaveFilePicker?: (options: unknown) => Promise<
    Readonly<{
      createWritable: () => Promise<
        Readonly<{
          write: (data: Uint8Array) => Promise<void>;
          close: () => Promise<void>;
          abort?: () => Promise<void>;
        }>
      >;
    }>
  >;
  window?: Readonly<{
    showSaveFilePicker?: BrowserDeliveryGlobals["showSaveFilePicker"];
  }>;
  document?: Readonly<{
    createElement: (tag: string) => {
      href: string;
      download: string;
      hidden: boolean;
      click: () => void;
    };
    body: Readonly<{
      appendChild: (el: unknown) => void;
      removeChild: (el: unknown) => void;
    }>;
  }>;
  URL?: Readonly<{
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
  }>;
  Blob?: typeof Blob;
}>;

/**
 * The composition-private synchronous start primitive
 * (docs/E0_INTERCHANGE_CONTRACT.md section 10). Before this function
 * returns — before any await or queued microtask — it probes transient
 * user activation and invokes either `showSaveFilePicker()` or the
 * temporary-anchor activation; the bytes were prepared earlier and no
 * encode, hash, clock read, A0 call, or A1 call occurs in the activation
 * interval. A false activation probe refuses
 * `export.delivery_user_gesture_required` and starts no browser work
 * (an ABSENT probe API is capability absence, not gesture absence, and
 * does not refuse). User AbortError is `cancelled` and never launches a
 * Blob fallback; every terminal closes or aborts its writer, removes its
 * anchor, and revokes its object URL exactly once, and reports honest
 * channel-discriminated cleanup evidence.
 */
export const startPreparedExportDelivery: StartPreparedExportDelivery = (
  request: PreparedExportDeliveryRequest,
): PreparedExportDeliveryStart => {
  const binding = request.binding;
  const bytes = request.privateBytes;
  const g = globalThis as unknown as BrowserDeliveryGlobals;

  const cleanZero = Object.freeze({
    cleanup: "complete" as const,
    objectUrlsCreated: 0 as const,
    objectUrlsRevoked: 0 as const,
    outstandingOwnedResources: 0 as const,
  });

  /* Activation probe: synchronous, adapter-observed, never caller-asserted. */
  const activation = g.navigator?.userActivation;
  if (activation !== undefined && activation.isActive !== true) {
    return Object.freeze({
      completion: Promise.resolve(
        Object.freeze({
          ok: false as const,
          outcome: "failed" as const,
          code: "export.delivery_user_gesture_required" as const,
          channel: null,
          artifact: binding,
          ...cleanZero,
        }),
      ),
    });
  }

  const picker = g.showSaveFilePicker ?? g.window?.showSaveFilePicker;
  const mediaType =
    binding.kind === "canonical-json"
      ? CANONICAL_JSON_MEDIA_TYPE
      : LEAD_SHEET_TEXT_MEDIA_TYPE;

  if (
    request.preference === "prefer-file-system-access" &&
    typeof picker === "function"
  ) {
    /* The picker is invoked HERE, synchronously, inside the activation
     * interval; everything after the first await runs on the completion. */
    let pickerPromise: Promise<
      Readonly<{
        createWritable: () => Promise<
          Readonly<{
            write: (data: Uint8Array) => Promise<void>;
            close: () => Promise<void>;
            abort?: () => Promise<void>;
          }>
        >;
      }>
    >;
    try {
      pickerPromise = picker({
        suggestedName: binding.filename,
        types: [
          {
            description:
              binding.kind === "canonical-json"
                ? "Changes Progression JSON"
                : "Changes Lead Sheet Text",
            accept: {
              [mediaType.split(";")[0] ?? mediaType]: [
                binding.kind === "canonical-json"
                  ? CANONICAL_JSON_FILENAME_EXTENSION
                  : LEAD_SHEET_TEXT_FILENAME_EXTENSION,
              ],
            },
          },
        ],
      });
    } catch {
      return Object.freeze({
        completion: Promise.resolve(
          Object.freeze({
            ok: false as const,
            outcome: "failed" as const,
            code: "export.delivery_activation_failed" as const,
            channel: "file-system-access" as const,
            artifact: binding,
            ...cleanZero,
          }),
        ),
      });
    }
    const completion = (async (): Promise<ExportDeliveryResult> => {
      let handle: Awaited<typeof pickerPromise>;
      try {
        handle = await pickerPromise;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { name?: unknown }).name === "AbortError"
        ) {
          return Object.freeze({
            ok: true as const,
            outcome: "cancelled" as const,
            channel: "file-system-access" as const,
            artifact: binding,
            ...cleanZero,
          });
        }
        return Object.freeze({
          ok: false as const,
          outcome: "failed" as const,
          code: "export.delivery_capability_failed" as const,
          channel: "file-system-access" as const,
          artifact: binding,
          ...cleanZero,
        });
      }
      let writer: Awaited<ReturnType<typeof handle.createWritable>>;
      try {
        writer = await handle.createWritable();
      } catch {
        return Object.freeze({
          ok: false as const,
          outcome: "failed" as const,
          code: "export.delivery_write_failed" as const,
          channel: "file-system-access" as const,
          artifact: binding,
          ...cleanZero,
        });
      }
      try {
        await writer.write(bytes);
        await writer.close();
      } catch {
        /* write or close failed: abort the writer; an abort failure is a
         * channel-discriminated cleanup breach with honest counts. */
        try {
          if (typeof writer.abort === "function") await writer.abort();
        } catch {
          return Object.freeze({
            ok: false as const,
            outcome: "cleanup-failed" as const,
            code: "export.delivery_cleanup_failed" as const,
            artifact: null,
            cleanup: "reconciliation-required" as const,
            channel: "file-system-access" as const,
            cleanupFailureKinds: Object.freeze([
              "writer-close",
              "writer-abort",
            ] as const),
            objectUrlsCreated: 0 as const,
            objectUrlsRevoked: 0 as const,
            outstandingOwnedResources: 1 as const,
          });
        }
        return Object.freeze({
          ok: false as const,
          outcome: "failed" as const,
          code: "export.delivery_write_failed" as const,
          channel: "file-system-access" as const,
          artifact: binding,
          ...cleanZero,
        });
      }
      return Object.freeze({
        ok: true as const,
        outcome: "completed" as const,
        channel: "file-system-access" as const,
        bytesOffered: bytes.byteLength,
        artifact: binding,
        ...cleanZero,
      });
    })();
    return Object.freeze({ completion });
  }

  /* Object-URL download path: one Blob, one URL, one temporary anchor,
   * activated once, removed, revoked exactly once — all synchronous. */
  if (
    g.Blob === undefined ||
    g.URL === undefined ||
    g.document === undefined
  ) {
    return Object.freeze({
      completion: Promise.resolve(
        Object.freeze({
          ok: false as const,
          outcome: "failed" as const,
          code: "export.delivery_capability_failed" as const,
          channel: null,
          artifact: binding,
          ...cleanZero,
        }),
      ),
    });
  }
  let url: string;
  try {
    const blob = new g.Blob([bytes as never], { type: mediaType });
    url = g.URL.createObjectURL(blob);
  } catch {
    return Object.freeze({
      completion: Promise.resolve(Object.freeze({
        ok: false as const,
        outcome: "failed" as const,
        code: "export.delivery_activation_failed" as const,
        channel: "object-url-download" as const,
        artifact: binding,
        ...cleanZero,
      })),
    });
  }
  let anchor: ReturnType<NonNullable<BrowserDeliveryGlobals["document"]>["createElement"]> | undefined;
  let appended = false;
  let activationFailed = false;
  try {
    anchor = g.document.createElement("a");
    anchor.href = url;
    anchor.download = binding.filename;
    /* The HTML attribute works under the standalone hash-only CSP; a
     * style property produces a WebKit CSP violation during download. */
    anchor.hidden = true;
    g.document.body.appendChild(anchor);
    appended = true;
    anchor.click();
  } catch {
    activationFailed = true;
  }
  let removeFailed = false;
  if (appended) {
    try {
      g.document.body.removeChild(anchor);
    } catch {
      removeFailed = true;
    }
  }
  let revokeFailed = false;
  try {
    g.URL.revokeObjectURL(url);
  } catch {
    revokeFailed = true;
  }

  if (removeFailed || revokeFailed) {
    const cleanup: ObjectUrlCleanupFailure =
      removeFailed && revokeFailed
        ? Object.freeze({ channel: "object-url-download", cleanupFailureKinds: Object.freeze(["anchor-remove", "object-url-revoke"] as const),
          objectUrlsCreated: 1, objectUrlsRevoked: 0, outstandingOwnedResources: 2 })
        : removeFailed
          ? Object.freeze({ channel: "object-url-download", cleanupFailureKinds: Object.freeze(["anchor-remove"] as const),
            objectUrlsCreated: 1, objectUrlsRevoked: 1, outstandingOwnedResources: 1 })
          : Object.freeze({ channel: "object-url-download", cleanupFailureKinds: Object.freeze(["object-url-revoke"] as const),
            objectUrlsCreated: 1, objectUrlsRevoked: 0, outstandingOwnedResources: 1 });
    return Object.freeze({
      completion: Promise.resolve(
        Object.freeze({
          ok: false as const,
          outcome: "cleanup-failed" as const,
          code: "export.delivery_cleanup_failed" as const,
          artifact: null,
          cleanup: "reconciliation-required" as const,
          ...cleanup,
        }),
      ),
    });
  }
  if (activationFailed) {
    return Object.freeze({
      completion: Promise.resolve(
        Object.freeze({
          ok: false as const,
          outcome: "failed" as const,
          code: "export.delivery_activation_failed" as const,
          channel: "object-url-download" as const,
          artifact: binding,
          cleanup: "complete" as const,
          objectUrlsCreated: 1 as const,
          objectUrlsRevoked: 1 as const,
          outstandingOwnedResources: 0 as const,
        }),
      ),
    });
  }
  return Object.freeze({
    completion: Promise.resolve(
      Object.freeze({
        ok: true as const,
        outcome: "handed-off" as const,
        channel: "object-url-download" as const,
        bytesOffered: bytes.byteLength,
        artifact: binding,
        cleanup: "complete" as const,
        objectUrlsCreated: 1 as const,
        objectUrlsRevoked: 1 as const,
        outstandingOwnedResources: 0 as const,
      }),
    ),
  });
};
