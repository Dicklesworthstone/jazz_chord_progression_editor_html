import {
  MAX_UTF8_IMPORT_BYTES,
  type ChordDegree,
  type ChordSpec,
  type CustomChordSpec,
  type DocumentShapeDecodeResult,
  type DomainPath,
  type SpelledPitch,
  type SpelledPitchClass,
  type ValidatedDocument,
} from "../domain";
import type {
  ChartDiagnostic,
  SymbolDiagnostic,
} from "../theory";
import {
  CANONICAL_JSON_ARTIFACT_SCHEMA,
  CANONICAL_JSON_FILENAME_EXTENSION,
  CANONICAL_JSON_MEDIA_TYPE,
  EXPORT_FILENAME_FORBIDDEN_CODE_POINTS,
  EXPORT_FILENAME_FORBIDDEN_CODE_POINT_RANGES,
  EXPORT_FILENAME_RESERVED_BASENAMES,
  LEAD_SHEET_TEXT_ARTIFACT_SCHEMA,
  LEAD_SHEET_TEXT_FILENAME_EXTENSION,
  LEAD_SHEET_TEXT_LOSS_REPORT_SCHEMA,
  LEAD_SHEET_TEXT_MEDIA_TYPE,
  LEAD_SHEET_TEXT_EXPORT_POLICY_ID,
  LEAD_SHEET_TEXT_EXPORT_POLICY_VERSION,
  MAX_CANONICAL_JSON_EXPORT_BYTES,
  MAX_EXPORT_FILENAME_BASENAME_CODE_POINTS,
  MAX_LEAD_SHEET_TEXT_EXPORT_BYTES,
  MAX_LEAD_SHEET_TEXT_LOSS_ITEMS,
  UNTITLED_CANONICAL_JSON_FILENAME,
  UNTITLED_LEAD_SHEET_TEXT_FILENAME,
  type CanonicalJsonArtifact,
  type CanonicalJsonExportDependencies,
  type CanonicalJsonExportResult,
  type CreateE0ExportOperations,
  type DeliverExportArtifact,
  type E0ExportCompositionDependencies,
  type ExportArtifactKind,
  type ExportDeliveryArtifactBinding,
  type ExportDeliveryRequest,
  type ExportDeliveryResult,
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
  type SanitizedExportFilename,
  type SanitizeExportFilename,
  type SemanticDocumentHash,
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
  if (den === 1) return `:${num}`;
  return `:${num}/${den}`;
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

    for (let sIdx = 0; sIdx < doc.sections.length; sIdx++) {
      const sec = doc.sections[sIdx]!;
      if (sec.measures.length === 0) {
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "export.text.section_empty",
            path: Object.freeze(["sections", sIdx, "measures"] as const),
          }),
        });
      }
      for (let mIdx = 0; mIdx < sec.measures.length; mIdx++) {
        const meas = sec.measures[mIdx]!;
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
        for (let eIdx = 0; eIdx < meas.events.length; eIdx++) {
          const ev = meas.events[eIdx]!;
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
    lines.push(`@meter ${doc.meter.beatsPerBar}/${doc.meter.beatUnit}`);
    lines.push(`@tempo ${doc.tempoBpm}`);

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

    for (let sIdx = 0; sIdx < doc.sections.length; sIdx++) {
      const sec = doc.sections[sIdx]!;
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

      const secHeader =
        sec.annotation.length > 0
          ? `[${sec.name}] ${JSON.stringify(sec.annotation)}`
          : `[${sec.name}]`;
      lines.push(secHeader);

      let prevCanonicalChordText: string | null = null;

      for (let mIdx = 0; mIdx < sec.measures.length; mIdx++) {
        const meas = sec.measures[mIdx]!;
        const eventTokens: string[] = [];

        for (let eIdx = 0; eIdx < meas.events.length; eIdx++) {
          const ev = meas.events[eIdx]!;
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
                diagnostics: Object.freeze([
                  ...formatRes.diagnostics,
                ]) as readonly [SymbolDiagnostic, ...SymbolDiagnostic[]],
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
          if (
            prevCanonicalChordText !== null &&
            prevCanonicalChordText === formattedChord
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

        const measureLine =
          eventTokens.length > 0
            ? `| ${eventTokens.join(" ")} |`
            : "| |";
        lines.push(measureLine);
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
          diagnostics: Object.freeze([
            ...parseResult.diagnostics,
          ]) as readonly [ChartDiagnostic, ...ChartDiagnostic[]],
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
              [artifact.mediaType.split(";")[0]!]: [
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
