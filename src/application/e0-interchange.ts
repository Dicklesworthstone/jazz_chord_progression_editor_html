import {
  type DocumentId,
  type DocumentShapeDecodeResult,
  type DomainPath,
  type ProgressionDocumentShapeV2,
  type StableIdFactory,
  type ValidatedDocument,
} from "../domain";
import {
  CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA,
  type A0E0InterchangeOwnerOperations,
  type ImportNonUndoableConfirmationAcknowledgement,
  type ImportNonUndoableConfirmationRequirement,
  type ImportReplacementImpact,
  type ImportReplacementOrigin,
  type ImportRequestIdentity,
  type PrepareImportReplacementPublicationRequest,
  type PreparedImportReplacementPublication,
  type PublishCanonicalExportRevisionRequest,
} from "./application-interchange-owner-contract";
import {
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  MAX_COMMAND_ID_CODE_POINTS,
  MAX_COMMAND_LABEL_CODE_POINTS,
  MAX_DRAFT_ISSUES,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_RETAINED_BYTES,
  type AppRevision,
  type AppState,
  type ApplicationCommandDependencies,
  type ApplicationEffect,
  type ApplicationRequestId,
  type ApplicationWorkCounters,
  type HistoryEntry,
  type HistoryState,
  type Notice,
  type ReplaceDocumentCommand,
  type ReplacementRetirementReceipt,
  type StableUiBookmarks,
  type TransportGeneration,
} from "./application-state-contract";
import {
  applicationHistoryRetainedByteEstimator,
  enforceHistoryCaps,
  isValidHistoryEstimate,
} from "./application-history";
import { initialBookmarks } from "./application-bookmarks";
import {
  buildDocumentIndex,
  createWorkCounters,
  deepStructuralEqual,
  freezeWorkCounters,
  isBoundedToken,
  isNonnegativeSafeInteger,
  isPositiveSafeInteger,
  runtimeField,
} from "./application-state-helpers";
import {
  CHART_IMPORT_DEFAULTS,
  CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
  E0_INTERCHANGE_CONTRACT_SCHEMA,
  IMPORT_FORMAT_HINTS,
  IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
  IMPORT_PREVIEW_POLICY_ID,
  IMPORT_PREVIEW_POLICY_VERSION,
  IMPORT_PREVIEW_SCHEMA,
  IMPORT_PUBLIC_PATH_FIELDS,
  IMPORT_REPLACEMENT_ORIGIN_BY_FORMAT,
  IMPORT_ROUTING_POLICY,
  IMPORT_SOURCE_CHANNELS,
  IMPORT_SOURCE_FORMATS,
  INTERCHANGE_IMPORT_DRAFT_SCHEMA,
  MAX_CANONICAL_EXPORT_PREPARATION_ID,
  MAX_E0_CHART_IMPORT_ID_REQUESTS,
  MAX_E0_IMPORT_UTF8_BYTES,
  MAX_IMPORT_PUBLIC_PATH_INDEX,
  MAX_IMPORT_PUBLIC_PATH_SEGMENTS,
  MIN_CANONICAL_EXPORT_PREPARATION_ID,
  PREPARED_CANONICAL_EXPORT_DELIVERY_SCHEMA,
  type AssessImportReplacementImpact,
  type BuildChartDocumentCandidate,
  type CanonicalExportMarkerCandidate,
  type CanonicalExportMarkerSettlementAdapters,
  type CanonicalExportPreparationBinding,
  type CanonicalExportPreparationId,
  type CanonicalExportPreparationIdentity,
  type ClassifyJsonLexically,
  type ClassifyJsonLexicallyResult,
  type CommitImportReplacement,
  type CommitImportReplacementDependencies,
  type CommitImportReplacementRequest,
  type CommitImportReplacementResult,
  type CompleteCanonicalExportMarkerSettlement,
  type CompleteCanonicalExportMarkerSettlementDependencies,
  type CompleteCanonicalExportMarkerSettlementRequest,
  type CompleteCanonicalExportMarkerSettlementResult,
  type DecodeUtf8Fatal,
  type DecodeUtf8FatalResult,
  type E0AdapterProtocolDiagnostic,
  type E0InterchangeOperations,
  type ExplicitlyUnavailableImportPreview,
  type ExplicitlyUnavailableImportReplacementImpact,
  type ImportFormatHint,
  type ImportIssue,
  type ImportIssueCode,
  type ImportIssueSummary,
  type ImportPayload,
  type ImportPreview,
  type ImportPreviewRefusal,
  type ImportPreviewReport,
  type ImportPreviewReportItem,
  type ImportPreviewSummary,
  type ImportPublicPath,
  type ImportPublicPathField,
  type ImportReplacementCommandSeed,
  type ImportReplacementImpactContext,
  type ImportSourceChannel,
  type ImportSourceFormat,
  type ImportStage,
  type JsonLexicalRoute,
  type LegacyMigrationRefusalProjection,
  type MarkerEligibleCanonicalExportDelivery,
  type ParseJsonData,
  type ParseJsonDataResult,
  type PrepareCanonicalExportDelivery,
  type PrepareCanonicalExportDeliveryDependencies,
  type PrepareCanonicalExportDeliveryRequest,
  type PrepareCanonicalExportDeliveryResult,
  type PrepareImportPreview,
  type PrepareImportPreviewDependencies,
  type PrepareImportPreviewRequest,
  type PrepareImportPreviewResult,
  type PreparedCanonicalExportDelivery,
  type PreparedCanonicalExportDeliveryRegistry,
  type PreparedCanonicalExportRegistryState,
  type PublishCanonicalExportRevisionResult,
  type PublishImportReplacementResult,
  type ReadImportSource,
  type ReadImportSourceRequest,
  type ReadImportSourceResult,
  type RetainedImportPreview,
  type RetainedImportReplacementImpact,
  type X1ReplacementRetirementAdapter,
  type X1ReplacementRetirementEvidence,
} from "./e0-interchange-contract";
import {
  E0_V2_COMMIT_REQUEST_SCHEMA,
  E0_V2_EXPORT_DELIVERY_REQUEST_SCHEMA,
  E0_V2_MARKER_SETTLEMENT_REQUEST_SCHEMA,
  E0_V2_PREVIEW_TO_OWNER_REQUEST_PROJECTION,
  type CommitImportReplacementRequestV2,
  type CommitImportReplacementResultV2,
  type CompleteCanonicalExportMarkerSettlementRequestV2,
  type E0V2CommitRefusalStage,
  type E0V2PortProtocolDiagnostic,
  type E0V2RetainedConfirmationBinding,
  type PrepareCanonicalExportDeliveryRequestV2,
  type PrepareImportPreviewRequestV2,
} from "./e0-interchange-v2-contract";
import {
  applyPreparedImportReplacementToLatestState,
  createExportRevisionMarkedState,
} from "./studio-interchange-owner";
import type {
  ChartDiagnostic,
  ChartTextDraft,
  ChartWarning,
  SourceRange,
} from "../theory";

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectPublicPath(path: DomainPath): ImportPublicPath {
  const projected: (ImportPublicPathField | "<redacted-field>" | "<invalid-index>" | "<path-truncated>" | number)[] = [];
  for (let i = 0; i < path.length; i++) {
    if (projected.length >= MAX_IMPORT_PUBLIC_PATH_SEGMENTS) {
      projected.push("<path-truncated>");
      break;
    }
    const segment = path[i];
    if (typeof segment === "number") {
      if (
        isNonnegativeSafeInteger(segment) &&
        segment <= MAX_IMPORT_PUBLIC_PATH_INDEX
      ) {
        projected.push(segment);
      } else {
        projected.push("<invalid-index>");
      }
    } else if (typeof segment === "string") {
      if ((IMPORT_PUBLIC_PATH_FIELDS as readonly string[]).includes(segment)) {
        projected.push(segment as ImportPublicPathField);
      } else {
        projected.push("<redacted-field>");
      }
    } else {
      projected.push("<redacted-field>");
    }
  }
  return Object.freeze(projected);
}

export const readImportSource: ReadImportSource = async (
  request: ReadImportSourceRequest,
  signal: AbortSignal,
): Promise<ReadImportSourceResult> => {
  if (signal.aborted) {
    return Object.freeze({
      ok: false,
      outcome: "cancelled",
      code: "import.read_cancelled",
      identity: request.identity,
    });
  }

  let rawResult: unknown;
  try {
    rawResult = await request.source.readAtMost(2_097_153, signal);
  } catch {
    if (signal.aborted) {
      return Object.freeze({
        ok: false,
        outcome: "cancelled",
        code: "import.read_cancelled",
        identity: request.identity,
      });
    }
    return Object.freeze({
      ok: false,
      outcome: "failed",
      code: "import.read_failed",
      identity: request.identity,
    });
  }

  if (signal.aborted) {
    return Object.freeze({
      ok: false,
      outcome: "cancelled",
      code: "import.read_cancelled",
      identity: request.identity,
    });
  }

  if (!isPlainRecord(rawResult)) {
    return Object.freeze({
      ok: false,
      outcome: "failed",
      code: "import.read_failed",
      identity: request.identity,
    });
  }

  if (rawResult["ok"] === false) {
    if (
      rawResult["outcome"] === "cancelled" ||
      rawResult["code"] === "import.read_cancelled"
    ) {
      return Object.freeze({
        ok: false,
        outcome: "cancelled",
        code: "import.read_cancelled",
        identity: request.identity,
      });
    }
    return Object.freeze({
      ok: false,
      outcome: "failed",
      code: "import.read_failed",
      identity: request.identity,
    });
  }

  if (rawResult["ok"] === true) {
    const rawBytes = rawResult["bytes"];
    const observedLength = rawResult["observedByteLength"];
    if (
      !(rawBytes instanceof Uint8Array) ||
      typeof observedLength !== "number" ||
      !isNonnegativeSafeInteger(observedLength) ||
      observedLength !== rawBytes.byteLength ||
      observedLength > 2_097_153
    ) {
      return Object.freeze({
        ok: false,
        outcome: "failed",
        code: "import.read_failed",
        identity: request.identity,
      });
    }

    const copiedBytes = new Uint8Array(rawBytes);
    const payload: ImportPayload = Object.freeze({
      identity: request.identity,
      channel: request.source.channel,
      displayName: request.source.displayName,
      mediaType: request.source.mediaType,
      observedByteLength: observedLength,
      bytes: copiedBytes,
    });

    return Object.freeze({ ok: true, value: payload });
  }

  return Object.freeze({
    ok: false,
    outcome: "failed",
    code: "import.read_failed",
    identity: request.identity,
  });
};

export const decodeUtf8Fatal: DecodeUtf8Fatal = (
  bytes: Uint8Array,
): DecodeUtf8FatalResult => {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return Object.freeze({ ok: true, value });
  } catch {
    return Object.freeze({ ok: false, code: "import.utf8_invalid" });
  }
};

export const classifyJsonLexically: ClassifyJsonLexically = (
  sourceText: string,
): ClassifyJsonLexicallyResult => {
  const text = sourceText;
  let pos = 0;
  const len = text.length;

  const skipWhitespace = () => {
    while (pos < len) {
      const ch = text.charCodeAt(pos);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        pos++;
      } else {
        break;
      }
    }
  };

  const parseStringToken = (): { value: string; start: number; end: number } | null => {
    if (pos >= len || text.charCodeAt(pos) !== 0x22) return null;
    const start = pos;
    pos++;
    let result = "";
    while (pos < len) {
      const ch = text.charCodeAt(pos);
      if (ch === 0x22) {
        pos++;
        return { value: result, start, end: pos };
      }
      if (ch === 0x5c) {
        pos++;
        if (pos >= len) return null;
        const esc = text.charAt(pos);
        pos++;
        if (esc === '"' || esc === '\\' || esc === '/') result += esc;
        else if (esc === 'b') result += '\b';
        else if (esc === 'f') result += '\f';
        else if (esc === 'n') result += '\n';
        else if (esc === 'r') result += '\r';
        else if (esc === 't') result += '\t';
        else if (esc === 'u') {
          if (pos + 4 > len) return null;
          const hex = text.slice(pos, pos + 4);
          pos += 4;
          const code = parseInt(hex, 16);
          if (Number.isNaN(code)) return null;
          result += String.fromCharCode(code);
        } else {
          return null;
        }
      } else {
        result += text.charAt(pos);
        pos++;
      }
    }
    return null;
  };

  const validateObject = (depth: number): {
    ok: boolean;
    schema: string | null;
    hasSections: boolean;
    dupKeyRange?: SourceRange;
  } => {
    if (pos >= len || text.charCodeAt(pos) !== 0x7b) {
      return { ok: false, schema: null, hasSections: false };
    }
    pos++;
    const seenKeys = new Set<string>();
    let schemaValue: string | null = null;
    let hasSections = false;

    skipWhitespace();
    if (pos < len && text.charCodeAt(pos) === 0x7d) {
      pos++;
      return { ok: true, schema: schemaValue, hasSections };
    }

    while (pos < len) {
      skipWhitespace();
      const strToken = parseStringToken();
      if (strToken === null) {
        return { ok: false, schema: schemaValue, hasSections };
      }
      if (seenKeys.has(strToken.value)) {
        return {
          ok: false,
          schema: schemaValue,
          hasSections,
          dupKeyRange: Object.freeze({
            startOffset: strToken.start,
            endOffset: strToken.end,
          }),
        };
      }
      seenKeys.add(strToken.value);

      skipWhitespace();
      if (pos >= len || text.charCodeAt(pos) !== 0x3a) {
        return { ok: false, schema: schemaValue, hasSections };
      }
      pos++;

      skipWhitespace();
      if (depth === 0) {
        if (strToken.value === "schema") {
          const valToken = parseStringToken();
          if (valToken !== null) {
            schemaValue = valToken.value;
          }
        } else if (strToken.value === "sections") {
          if (pos < len && text.charCodeAt(pos) === 0x5b) {
            hasSections = true;
          }
        }
      }

      skipValue(depth + 1);

      skipWhitespace();
      if (pos < len && text.charCodeAt(pos) === 0x2c) {
        pos++;
      } else if (pos < len && text.charCodeAt(pos) === 0x7d) {
        pos++;
        break;
      } else {
        return { ok: false, schema: schemaValue, hasSections };
      }
    }
    return { ok: true, schema: schemaValue, hasSections };
  };

  const skipValue = (depth: number) => {
    skipWhitespace();
    if (pos >= len) return;
    const ch = text.charCodeAt(pos);
    if (ch === 0x7b) {
      validateObject(depth);
    } else if (ch === 0x5b) {
      pos++;
      while (pos < len) {
        skipWhitespace();
        if (pos < len && text.charCodeAt(pos) === 0x5d) {
          pos++;
          break;
        }
        skipValue(depth + 1);
        skipWhitespace();
        if (pos < len && text.charCodeAt(pos) === 0x2c) {
          pos++;
        } else if (pos < len && text.charCodeAt(pos) === 0x5d) {
          pos++;
          break;
        } else {
          break;
        }
      }
    } else if (ch === 0x22) {
      parseStringToken();
    } else {
      while (pos < len) {
        const c = text.charCodeAt(pos);
        if (
          c === 0x2c ||
          c === 0x7d ||
          c === 0x5d ||
          c === 0x20 ||
          c === 0x09 ||
          c === 0x0a ||
          c === 0x0d
        ) {
          break;
        }
        pos++;
      }
    }
  };

  skipWhitespace();
  if (pos >= len || text.charCodeAt(pos) !== 0x7b) {
    return Object.freeze({
      ok: true,
      route: "host-parse-to-diagnose-malformed",
      schema: null,
      rootOwnSectionsArrayObserved: false,
    });
  }

  const rootRes = validateObject(0);
  if (rootRes.dupKeyRange !== undefined) {
    return Object.freeze({
      ok: false,
      code: "import.json_duplicate_key",
      range: rootRes.dupKeyRange,
    });
  }

  if (!rootRes.ok) {
    return Object.freeze({
      ok: true,
      route: "host-parse-to-diagnose-malformed",
      schema: rootRes.schema,
      rootOwnSectionsArrayObserved: rootRes.hasSections,
    });
  }

  const schema = rootRes.schema;
  const hasSections = rootRes.hasSections;

  let route: JsonLexicalRoute = "unversioned-unrecognized";
  if (schema === "changes.progression.v2") {
    route = "canonical-v2";
  } else if (
    schema !== null &&
    /^changes\.progression\.v(?:[3-9]|[1-9][0-9]+)$/.test(schema)
  ) {
    route = "future-canonical";
  } else if (schema !== null) {
    route = "unsupported-schema";
  } else if (hasSections) {
    route = "unversioned-legacy";
  }

  return Object.freeze({
    ok: true,
    route,
    schema,
    rootOwnSectionsArrayObserved: hasSections,
  });
};

export const parseJsonData: ParseJsonData = (
  sourceText: string,
): ParseJsonDataResult => {
  try {
    const value = JSON.parse(sourceText);
    return Object.freeze({ ok: true, value });
  } catch {
    return Object.freeze({
      ok: false,
      code: "import.json_syntax_invalid",
      range: null,
    });
  }
};

export const buildChartDocumentCandidate: BuildChartDocumentCandidate = (
  draft: ChartTextDraft,
  idFactory: StableIdFactory,
):
  | Readonly<{ ok: true; value: ProgressionDocumentShapeV2 }>
  | Readonly<{
      ok: false;
      code: "limit.chart_import_id_requests_exceeded";
      path: DomainPath;
      received: 73_794;
      maximum: typeof MAX_E0_CHART_IMPORT_ID_REQUESTS;
    }>
  | Readonly<{
      ok: false;
      code: "import.chart_id_factory_failed" | "import.chart_id_collision";
      path: DomainPath;
    }> => {
  let requestCount = 0;
  const existingIds = new Set<string>();

  const nextId = (kind: "document" | "section" | "measure" | "event"): string | null => {
    requestCount++;
    if (requestCount > MAX_E0_CHART_IMPORT_ID_REQUESTS) {
      return null;
    }
    const res = idFactory(kind);
    if (!res.ok) return null;
    if (existingIds.has(res.value)) return null;
    existingIds.add(res.value);
    return res.value;
  };

  const docId = nextId("document");
  if (docId === null) {
    if (requestCount > MAX_E0_CHART_IMPORT_ID_REQUESTS) {
      return Object.freeze({
        ok: false,
        code: "limit.chart_import_id_requests_exceeded",
        path: Object.freeze([] as const),
        received: 73_794,
        maximum: MAX_E0_CHART_IMPORT_ID_REQUESTS,
      });
    }
    return Object.freeze({
      ok: false,
      code: "import.chart_id_factory_failed",
      path: Object.freeze([] as const),
    });
  }

  const sections: ProgressionDocumentShapeV2["sections"] = [];
  for (let sIdx = 0; sIdx < draft.sections.length; sIdx++) {
    const sDraft = draft.sections[sIdx]!;
    const secId = nextId("section");
    if (secId === null) {
      if (requestCount > MAX_E0_CHART_IMPORT_ID_REQUESTS) {
        return Object.freeze({
          ok: false,
          code: "limit.chart_import_id_requests_exceeded",
          path: Object.freeze(["sections", sIdx] as const),
          received: 73_794,
          maximum: MAX_E0_CHART_IMPORT_ID_REQUESTS,
        });
      }
      return Object.freeze({
        ok: false,
        code: "import.chart_id_factory_failed",
        path: Object.freeze(["sections", sIdx] as const),
      });
    }

    const measures: ProgressionDocumentShapeV2["sections"][number]["measures"] = [];
    for (let mIdx = 0; mIdx < sDraft.measures.length; mIdx++) {
      const mDraft = sDraft.measures[mIdx]!;
      const measId = nextId("measure");
      if (measId === null) {
        if (requestCount > MAX_E0_CHART_IMPORT_ID_REQUESTS) {
          return Object.freeze({
            ok: false,
            code: "limit.chart_import_id_requests_exceeded",
            path: Object.freeze(["sections", sIdx, "measures", mIdx] as const),
            received: 73_794,
            maximum: MAX_E0_CHART_IMPORT_ID_REQUESTS,
          });
        }
        return Object.freeze({
          ok: false,
          code: "import.chart_id_factory_failed",
          path: Object.freeze(["sections", sIdx, "measures", mIdx] as const),
        });
      }

      const events: ProgressionDocumentShapeV2["sections"][number]["measures"][number]["events"] = [];
      for (let eIdx = 0; eIdx < mDraft.events.length; eIdx++) {
        const eDraft = mDraft.events[eIdx]!;
        const evId = nextId("event");
        if (evId === null) {
          if (requestCount > MAX_E0_CHART_IMPORT_ID_REQUESTS) {
            return Object.freeze({
              ok: false,
              code: "limit.chart_import_id_requests_exceeded",
              path: Object.freeze(["sections", sIdx, "measures", mIdx, "events", eIdx] as const),
              received: 73_794,
              maximum: MAX_E0_CHART_IMPORT_ID_REQUESTS,
            });
          }
          return Object.freeze({
            ok: false,
            code: "import.chart_id_factory_failed",
            path: Object.freeze(["sections", sIdx, "measures", mIdx, "events", eIdx] as const),
          });
        }

        events.push(
          Object.freeze({
            id: evId,
            duration: eDraft.duration,
            annotation: eDraft.annotation,
            chord: eDraft.chord,
            voicing: CHART_IMPORT_DEFAULTS.autoVoicing,
          }),
        );
      }

      measures.push(
        Object.freeze({
          id: measId,
          events: Object.freeze(events),
          completion: mDraft.completion,
        }),
      );
    }

    sections.push(
      Object.freeze({
        id: secId,
        name: sDraft.name ?? `Section ${sIdx + 1}`,
        annotation: sDraft.annotation ?? "",
        keyOverride: null,
        voiceLeadingBoundary: "reset" as const,
        measures: Object.freeze(measures),
      }),
    );
  }

  const shape: ProgressionDocumentShapeV2 = Object.freeze({
    schema: "changes.progression.v2" as const,
    id: docId,
    title: draft.headers.title ?? CHART_IMPORT_DEFAULTS.title,
    description: draft.headers.description ?? CHART_IMPORT_DEFAULTS.description,
    meter: draft.headers.meter,
    tempoBpm: draft.headers.tempoBpm ?? CHART_IMPORT_DEFAULTS.tempoBpm,
    key: draft.headers.key ?? null,
    sections: Object.freeze(sections),
    playback: CHART_IMPORT_DEFAULTS.playback,
  });

  return Object.freeze({ ok: true, value: shape });
};

export function createPrepareImportPreviewCoordinator(
  dependencies: PrepareImportPreviewDependencies,
): PrepareImportPreview {
  return (
    request: PrepareImportPreviewRequest,
  ): PrepareImportPreviewResult => {
    const payload = request.payload;
    const formatHint = request.formatHint;

    const makeRefusal = (
      code: ImportIssueCode,
      stage: ImportStage,
      path: ImportPublicPath = Object.freeze([] as const),
      range: SourceRange | null = null,
      extraIssues: readonly ImportIssue[] = [],
      legacyRefusal: LegacyMigrationRefusalProjection | null = null,
    ): PrepareImportPreviewResult => {
      const primary: ImportIssue = Object.freeze({
        code,
        stage,
        path,
        range,
      });
      const allIssues = [primary, ...extraIssues];
      const issues: ImportIssueSummary = Object.freeze({
        total: allIssues.length,
        retained: Object.freeze(allIssues.slice(0, 64)),
        omitted: Math.max(0, allIssues.length - 64),
        retentionPolicy: "stage-path-code-first-64",
      });
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code,
          stage,
          path,
          range,
          issues,
          legacyRefusal,
        }),
      });
    };

    const preflight = dependencies.preflightDocumentImportBytes(payload.bytes);
    if (!preflight.ok) {
      return makeRefusal(
        "limit.import_bytes_exceeded",
        "byte-preflight",
        projectPublicPath(preflight.errors[0].path),
      );
    }

    const decodedUtf8 = dependencies.decodeUtf8Fatal(payload.bytes);
    if (!decodedUtf8.ok) {
      return makeRefusal(decodedUtf8.code, "utf8-decode");
    }
    const text = decodedUtf8.value;

    const trimmedStart = text.trimStart();
    const firstChar = trimmedStart.length > 0 ? trimmedStart.charAt(0) : "";
    const isJsonLooking = firstChar === "{" || firstChar === "[";

    if (formatHint === "chart-text" && isJsonLooking) {
      return makeRefusal("import.format_mismatch", "format-classification");
    }
    if (
      (formatHint === "canonical-json" || formatHint === "legacy-json") &&
      !isJsonLooking
    ) {
      return makeRefusal("import.format_mismatch", "format-classification");
    }

    let candidateDoc: ValidatedDocument | null = null;
    let sourceFormat: ImportSourceFormat = "canonical-json-v2";
    let origin: "canonical-import" | "legacy-import" = "canonical-import";
    let reportItems: ImportPreviewReportItem[] = [];

    if (isJsonLooking) {
      const lexical = dependencies.classifyJsonLexically(text);
      if (!lexical.ok) {
        return makeRefusal(lexical.code, "json-lexical-preflight", Object.freeze([] as const), lexical.range);
      }

      const route = lexical.route;
      if (formatHint === "canonical-json" && route === "unversioned-legacy") {
        return makeRefusal("import.format_mismatch", "schema-route");
      }
      if (formatHint === "legacy-json" && route === "canonical-v2") {
        return makeRefusal("import.format_mismatch", "schema-route");
      }

      if (route === "future-canonical") {
        return makeRefusal("import.future_schema_unsupported", "schema-route");
      }
      if (route === "unsupported-schema") {
        return makeRefusal("import.schema_unsupported", "schema-route");
      }
      if (route === "unversioned-unrecognized") {
        return makeRefusal("import.json_shape_unrecognized", "schema-route");
      }

      if (route === "canonical-v2" || route === "host-parse-to-diagnose-malformed") {
        const parsedRes = dependencies.parseJsonData(text);
        if (!parsedRes.ok) {
          return makeRefusal(parsedRes.code, "json-parse-or-legacy-migration", Object.freeze([] as const), parsedRes.range);
        }
        if (route === "host-parse-to-diagnose-malformed") {
          return makeRefusal("import.json_shape_unrecognized", "schema-route");
        }

        const decoded = dependencies.decodeDocumentShape(parsedRes.value);
        if (!decoded.ok) {
          const firstErr = decoded.errors[0];
          return makeRefusal(
            "import.canonical_structural_invalid",
            "structural-decode",
            projectPublicPath(firstErr.path),
            null,
            decoded.errors.map((e) =>
              Object.freeze({
                code: e.code as ImportIssueCode,
                stage: "structural-decode" as const,
                path: projectPublicPath(e.path),
                range: null,
              }),
            ),
          );
        }

        const validated = dependencies.validateDocumentSemantics(decoded.value);
        if (!validated.ok) {
          const firstErr = validated.errors[0];
          return makeRefusal(
            "import.canonical_semantic_invalid",
            "semantic-validation",
            projectPublicPath(firstErr.path),
            null,
            validated.errors.map((e) =>
              Object.freeze({
                code: e.code as ImportIssueCode,
                stage: "semantic-validation" as const,
                path: projectPublicPath(e.path),
                range: null,
              }),
            ),
          );
        }

        candidateDoc = validated.value;
        sourceFormat = "canonical-json-v2";
        origin = "canonical-import";
      } else if (route === "unversioned-legacy") {
        const legacyRes = dependencies.migrateLegacyJson(
          payload.bytes,
          dependencies.legacyMigrationDependencies,
        );
        if (!legacyRes.ok) {
          const legRef = legacyRes.refusal;
          return makeRefusal(
            "import.legacy_refused",
            "json-parse-or-legacy-migration",
            projectPublicPath(legRef.path),
            null,
            [],
            Object.freeze({
              code: legRef.code as any,
              path: projectPublicPath(legRef.path),
              detail: null,
            }),
          );
        }

        const decoded = dependencies.decodeDocumentShape(legacyRes.candidate);
        if (!decoded.ok) {
          return makeRefusal(
            "import.canonical_structural_invalid",
            "structural-decode",
            projectPublicPath(decoded.errors[0].path),
          );
        }

        const validated = dependencies.validateDocumentSemantics(decoded.value);
        if (!validated.ok) {
          return makeRefusal(
            "import.canonical_semantic_invalid",
            "semantic-validation",
            projectPublicPath(validated.errors[0].path),
          );
        }

        candidateDoc = validated.value;
        sourceFormat = "unversioned-legacy-json";
        origin = "legacy-import";

        if (legacyRes.report && legacyRes.report.groups) {
          for (const group of legacyRes.report.groups) {
            for (const item of group.items) {
              reportItems.push(
                Object.freeze({
                  code: item.code as any,
                  sourcePath: projectPublicPath(item.sourcePath),
                  targetPath: item.targetPath ? projectPublicPath(item.targetPath) : null,
                }),
              );
            }
          }
        }
      }
    } else {
      const parseRes = dependencies.parseChartText(
        text,
        { mode: "document" },
        CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
      );
      if (!parseRes.ok) {
        return makeRefusal(
          "import.chart_invalid",
          "chart-parse",
          Object.freeze([] as const),
          parseRes.diagnostics[0]?.range ?? null,
        );
      }

      if (parseRes.draft.mode === "fragment") {
        return makeRefusal("import.chart_fragment_forbidden", "chart-parse");
      }

      const builtCandidate = dependencies.buildChartDocumentCandidate(
        parseRes.draft,
        dependencies.chartIdFactory,
      );
      if (!builtCandidate.ok) {
        return makeRefusal(
          builtCandidate.code,
          "chart-candidate-construction",
          projectPublicPath(builtCandidate.path),
        );
      }

      const decoded = dependencies.decodeDocumentShape(builtCandidate.value);
      if (!decoded.ok) {
        return makeRefusal(
          "import.canonical_structural_invalid",
          "structural-decode",
          projectPublicPath(decoded.errors[0].path),
        );
      }

      const validated = dependencies.validateDocumentSemantics(decoded.value);
      if (!validated.ok) {
        return makeRefusal(
          "import.canonical_semantic_invalid",
          "semantic-validation",
          projectPublicPath(validated.errors[0].path),
        );
      }

      candidateDoc = validated.value;
      sourceFormat = "chart-text-v1";
      origin = "canonical-import";
    }

    if (candidateDoc === null) {
      return makeRefusal("import.json_shape_unrecognized", "schema-route");
    }

    let chordEventsCount = 0;
    let emptyMeasuresCount = 0;
    let manualVoicingsCount = 0;
    let frozenVoicingsCount = 0;
    let customChordsCount = 0;
    let measuresCount = 0;

    for (const sec of candidateDoc.sections) {
      measuresCount += sec.measures.length;
      for (const meas of sec.measures) {
        if (meas.events.length === 0) emptyMeasuresCount++;
        chordEventsCount += meas.events.length;
        for (const ev of meas.events) {
          if (ev.chord.kind === "custom") customChordsCount++;
          if (ev.voicing.mode === "manual") manualVoicingsCount++;
          if (ev.voicing.mode === "frozen") frozenVoicingsCount++;
        }
      }
    }

    const previewSummary: ImportPreviewSummary = Object.freeze({
      sections: candidateDoc.sections.length,
      measures: measuresCount,
      chordEvents: chordEventsCount,
      emptyMeasures: emptyMeasuresCount,
      manualVoicings: manualVoicingsCount,
      frozenVoicings: frozenVoicingsCount,
      customChords: customChordsCount,
      migrationWarnings: reportItems.length,
      migrationRejectedSections: 0,
      migrationRejectedEvents: 0,
    });

    const impactRes = dependencies.assessImportReplacementImpact(
      request.replacementImpactContext,
      candidateDoc,
    );
    if (!impactRes.ok) {
      return makeRefusal(
        "import.replacement_impact_unavailable",
        "preview-publication",
      );
    }
    const impact = impactRes.value;

    const report: ImportPreviewReport = Object.freeze({
      totalItems: reportItems.length,
      retainedItems: Object.freeze(reportItems.slice(0, 256)),
      omittedItems: Math.max(0, reportItems.length - 256),
      retentionPolicy: "group-source-path-code-target-path-first-256",
    });

    const issues: ImportIssueSummary = Object.freeze({
      total: 0,
      retained: Object.freeze([]),
      omitted: 0,
      retentionPolicy: "stage-path-code-first-64",
    });

    const basePreview = {
      schema: IMPORT_PREVIEW_SCHEMA,
      policyId: IMPORT_PREVIEW_POLICY_ID,
      policyVersion: IMPORT_PREVIEW_POLICY_VERSION,
      identity: payload.identity,
      sourceFormat,
      replacementOrigin: origin,
      candidate: candidateDoc,
      summary: previewSummary,
      issues,
      report,
      replacementCommandSeed: request.replacementImpactContext.command,
      rawSourceRetained: false as const,
      autoApplyAuthorized: false as const,
    };

    if (impact.undoDisposition === "retained") {
      const preview: RetainedImportPreview = Object.freeze({
        ...basePreview,
        replacementImpact: impact as RetainedImportReplacementImpact,
        nonUndoableConfirmationRequirement: null,
      });
      return Object.freeze({ ok: true, value: preview });
    } else {
      const req: ImportNonUndoableConfirmationRequirement = Object.freeze({
        schema: IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
        confirmationId: request.nonUndoableConfirmationSeed.confirmationId,
        identity: payload.identity,
        candidateDocumentId: candidateDoc.id,
        commandId: request.replacementImpactContext.command.id,
        disclosedImpact: impact as ExplicitlyUnavailableImportReplacementImpact,
      });
      const preview: ExplicitlyUnavailableImportPreview = Object.freeze({
        ...basePreview,
        replacementImpact: impact as ExplicitlyUnavailableImportReplacementImpact,
        nonUndoableConfirmationRequirement: req,
      });
      return Object.freeze({ ok: true, value: preview });
    }
  };
}

export function createE0V2TransactionDriver(
  ownerPorts: A0E0InterchangeOwnerOperations,
  x1Adapter: X1ReplacementRetirementAdapter,
) {
  return async (
    request: CommitImportReplacementRequestV2,
  ): Promise<CommitImportReplacementResultV2> => {
    const ownerReq = request.ownerRequest;
    const identity = ownerReq.identity;
    const binding = request.confirmationBinding;

    // Step 1: Prove consent / provenance before calling owner (E0V2-RES-04)
    if (ownerReq.disclosedImpact.undoDisposition === "explicitly-unavailable") {
      if (binding.acknowledgement === null) {
        const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
        return Object.freeze({
          ok: false,
          outcome: "refused",
          stage: "pre-owner-provenance",
          code: "history.nonundoable_confirmation_required",
          identity,
          observedIdentity: observed,
          liveForRequest: 0,
        });
      }
      if (
        binding.displayedRequirement === null ||
        !deepStructuralEqual(
          binding.displayedRequirement,
          binding.acknowledgement.requirement,
        )
      ) {
        const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
        return Object.freeze({
          ok: false,
          outcome: "refused",
          stage: "pre-owner-provenance",
          code: "import.confirmation_identity_mismatch",
          identity,
          observedIdentity: observed,
          liveForRequest: 0,
        });
      }
    } else {
      if (binding.acknowledgement !== null) {
        const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
        return Object.freeze({
          ok: false,
          outcome: "refused",
          stage: "pre-owner-provenance",
          code: "import.confirmation_identity_mismatch",
          identity,
          observedIdentity: observed,
          liveForRequest: 0,
        });
      }
    }

    // Step 2: Prepare publication with owner port
    let prepResult: ReturnType<typeof ownerPorts.prepareImportReplacementPublication>;
    try {
      prepResult = ownerPorts.prepareImportReplacementPublication(ownerReq);
    } catch {
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "protocol-invalid",
        stage: "port-protocol",
        diagnostic: Object.freeze({
          port: "prepareImportReplacementPublication",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        }),
        identity,
        observedIdentity: observed,
        reconciliation: "none",
        liveForRequest: 0,
      });
    }

    if (!isPlainRecord(prepResult) || typeof prepResult["ok"] !== "boolean") {
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "protocol-invalid",
        stage: "port-protocol",
        diagnostic: Object.freeze({
          port: "prepareImportReplacementPublication",
          reason: "invalid-envelope",
          rawResultRetained: false,
        }),
        identity,
        observedIdentity: observed,
        reconciliation: "none",
        liveForRequest: 0,
      });
    }

    if (!prepResult.ok) {
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "refused",
        stage: "owner-preparation",
        code: prepResult.code,
        identity,
        observedIdentity: observed,
        liveForRequest: 0,
      });
    }

    const preparedEcho = prepResult.value;

    // Step 3: Drive X1 transport retirement
    let retireRaw: unknown;
    try {
      retireRaw = await x1Adapter.retireImportReplacement({
        identity,
        sourceFormat: ownerReq.sourceFormat,
        candidateDocumentId: ownerReq.candidate.id,
        expectedTransportGeneration: preparedEcho.expectedTransportGeneration,
        scope: "progression-and-preview",
        requiredPostcondition: "zero-future-attack",
      });
    } catch {
      ownerPorts.discardImportReplacementPublication({
        identity,
        reason: "transport-retirement-evidence-invalid",
      });
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "refused",
        stage: "transport-retirement",
        code: "transport.replacement_retirement_evidence_invalid",
        identity,
        observedIdentity: observed,
        liveForRequest: 0,
      });
    }

    if (
      !isPlainRecord(retireRaw) ||
      typeof retireRaw["ok"] !== "boolean" ||
      (retireRaw["ok"] === true &&
        (!isPlainRecord(retireRaw["value"]) ||
          !isPlainRecord(runtimeField(retireRaw["value"], "receipt"))))
    ) {
      ownerPorts.discardImportReplacementPublication({
        identity,
        reason: "transport-retirement-evidence-invalid",
      });
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "refused",
        stage: "transport-retirement",
        code: "transport.replacement_retirement_evidence_invalid",
        identity,
        observedIdentity: observed,
        liveForRequest: 0,
      });
    }

    if (!retireRaw.ok) {
      ownerPorts.discardImportReplacementPublication({
        identity,
        reason: "transport-retirement-refused",
      });
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "refused",
        stage: "transport-retirement",
        code: "transport.replacement_retirement_refused",
        identity,
        observedIdentity: observed,
        liveForRequest: 0,
      });
    }

    const retirementEvidence = retireRaw["value"] as {
      receipt: ReplacementRetirementReceipt;
    };
    const retirementReceipt = retirementEvidence.receipt;

    // Step 4: Publish with owner port
    let pubResult: ReturnType<typeof ownerPorts.publishImportReplacement>;
    try {
      pubResult = ownerPorts.publishImportReplacement({
        prepared: preparedEcho,
        retirement: retirementReceipt,
      });
    } catch {
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "protocol-invalid",
        stage: "port-protocol",
        diagnostic: Object.freeze({
          port: "publishImportReplacement",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        }),
        identity,
        observedIdentity: observed,
        reconciliation: "application-transport-reconciliation-required",
        liveForRequest: 0,
      });
    }

    if (!isPlainRecord(pubResult) || typeof pubResult["ok"] !== "boolean") {
      const observed = ownerPorts.readCurrentApplicationDocumentIdentity();
      return Object.freeze({
        ok: false,
        outcome: "protocol-invalid",
        stage: "port-protocol",
        diagnostic: Object.freeze({
          port: "publishImportReplacement",
          reason: "invalid-envelope",
          rawResultRetained: false,
        }),
        identity,
        observedIdentity: observed,
        reconciliation: "application-transport-reconciliation-required",
        liveForRequest: 0,
      });
    }

    if (!pubResult.ok) {
      return Object.freeze({
        ok: false,
        outcome: "refused",
        stage: "owner-publication",
        code: pubResult.code,
        identity,
        observedIdentity: Object.freeze({
          documentId: pubResult.observedDocumentId,
          revision: pubResult.observedRevision,
        }),
        liveForRequest: 0,
      });
    }

    return Object.freeze({
      ok: true,
      outcome: "committed",
      identity,
      documentId: pubResult.documentId,
      revision: pubResult.revision,
      effects: pubResult.effects,
      counters: pubResult.counters,
      liveForRequest: 0,
    });
  };
}

export function createPreparedCanonicalExportDeliveryRegistry(): PreparedCanonicalExportDeliveryRegistry {
  let registryState: PreparedCanonicalExportRegistryState = "empty";
  let currentPreparationId = 1 as CanonicalExportPreparationId;
  let currentGeneration = 1;
  let storedDelivery: PreparedCanonicalExportDelivery | null = null;
  let activeIdentity: CanonicalExportPreparationIdentity | null = null;

  return Object.freeze({
    begin: (stateIdentity) => {
      if (registryState === "preparing" || registryState === "delivering") {
        return Object.freeze({
          ok: false,
          code: "export.preparation_busy",
          state: registryState,
        });
      }
      if (currentPreparationId >= MAX_CANONICAL_EXPORT_PREPARATION_ID) {
        return Object.freeze({
          ok: false,
          code: "export.preparation_sequence_exhausted",
          state: registryState,
        });
      }
      const prepId = currentPreparationId as CanonicalExportPreparationId;
      const gen = currentGeneration;
      currentPreparationId = (currentPreparationId + 1) as CanonicalExportPreparationId;
      currentGeneration++;

      activeIdentity = Object.freeze({
        preparationId: prepId,
        generation: gen,
        documentId: stateIdentity.documentId,
        revision: stateIdentity.revision,
      });
      registryState = "preparing";
      storedDelivery = null;

      return Object.freeze({
        ok: true,
        identity: activeIdentity,
        state: "preparing",
      });
    },
    publish: (value) => {
      if (
        activeIdentity !== null &&
        value.identity.preparationId === activeIdentity.preparationId &&
        value.identity.generation === activeIdentity.generation
      ) {
        storedDelivery = value;
        registryState = "ready";
        return Object.freeze({ outcome: "ready", state: "ready" });
      }
      storedDelivery = null;
      activeIdentity = null;
      registryState = "empty";
      return Object.freeze({ outcome: "discarded-stale", state: "empty" });
    },
    take: (request) => {
      if (
        registryState === "ready" &&
        storedDelivery !== null &&
        activeIdentity !== null &&
        request.preparationId === activeIdentity.preparationId &&
        request.stateIdentity.documentId === activeIdentity.documentId &&
        request.stateIdentity.revision === activeIdentity.revision
      ) {
        const val = storedDelivery;
        registryState = "delivering";
        return Object.freeze({
          outcome: "taken",
          value: val,
          registryState: "delivering",
        });
      }
      if (
        activeIdentity !== null &&
        request.preparationId === activeIdentity.preparationId &&
        (request.stateIdentity.documentId !== activeIdentity.documentId ||
          request.stateIdentity.revision !== activeIdentity.revision)
      ) {
        storedDelivery = null;
        activeIdentity = null;
        registryState = "empty";
        return Object.freeze({
          outcome: "discarded-stale",
          value: null,
          registryState: "empty",
        });
      }
      return Object.freeze({
        outcome: "unavailable",
        value: null,
        registryState,
      });
    },
    abandonPreparation: (preparationId) => {
      if (
        activeIdentity !== null &&
        preparationId === activeIdentity.preparationId &&
        (registryState === "preparing" || registryState === "ready")
      ) {
        storedDelivery = null;
        activeIdentity = null;
        registryState = "empty";
        return Object.freeze({
          outcome: "abandoned",
          registryState: "empty",
        });
      }
      return Object.freeze({
        outcome: "ignored-stale",
        registryState,
      });
    },
    finishDelivery: (preparationId) => {
      if (
        activeIdentity !== null &&
        preparationId === activeIdentity.preparationId &&
        registryState === "delivering"
      ) {
        storedDelivery = null;
        activeIdentity = null;
        registryState = "empty";
        return Object.freeze({
          outcome: "finished",
          registryState: "empty",
        });
      }
      return Object.freeze({
        outcome: "ignored-stale",
        registryState,
      });
    },
    state: () => registryState,
  });
}

export function createE0InterchangeOperations(
  dependencies: CommitImportReplacementDependencies & {
    prepareImportPreview: PrepareImportPreviewDependencies;
    canonicalExportDelivery: PrepareCanonicalExportDeliveryDependencies;
    canonicalExportMarkerSettlement: CompleteCanonicalExportMarkerSettlementDependencies;
  },
): E0InterchangeOperations {
  const previewCoordinator = createPrepareImportPreviewCoordinator(
    dependencies.prepareImportPreview,
  );
  const deliveryRegistry = createPreparedCanonicalExportDeliveryRegistry();

  return Object.freeze({
    readImportSource,
    prepareImportPreview: previewCoordinator,
    commitImportReplacement: async (
      request: CommitImportReplacementRequest,
    ): Promise<CommitImportReplacementResult> => {
      const preview = request.preview;
      const identity = preview.identity;
      const format = preview.sourceFormat;
      const origin = preview.replacementOrigin;

      let prepResRaw: unknown;
      try {
        prepResRaw = await dependencies.prepareImportReplacementPublication(
          request,
        );
      } catch {
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A0-replacement-preparation";
        } = Object.freeze({
          boundary: "A0-replacement-preparation",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        });
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "preparation-protocol-invalid",
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "import.replacement_preparation_result_invalid",
            path: Object.freeze([] as const),
          }),
          state: request.currentState,
          retirementDisposition: "unchanged",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
          protocolDiagnostic: diagnostic,
        });
      }

      if (
        !isPlainRecord(prepResRaw) ||
        typeof prepResRaw["ok"] !== "boolean"
      ) {
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A0-replacement-preparation";
        } = Object.freeze({
          boundary: "A0-replacement-preparation",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        });
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "preparation-protocol-invalid",
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "import.replacement_preparation_result_invalid",
            path: Object.freeze([] as const),
          }),
          state: request.currentState,
          retirementDisposition: "unchanged",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
          protocolDiagnostic: diagnostic,
        });
      }

      if (prepResRaw.ok === false) {
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: prepResRaw["code"] as any,
            path: Object.freeze([] as const),
          }),
          state: request.currentState,
          retirementDisposition: "unchanged",
          preparationDisposition: "not-created",
          preparationInvalidation: null,
          publication: null,
        });
      }

      const prepared = prepResRaw["value"] as PreparedImportReplacementPublication;

      let retireResRaw: unknown;
      try {
        retireResRaw = await dependencies.retireImportReplacement({
          identity,
          sourceFormat: format,
          candidateDocumentId: preview.candidate.id,
          expectedTransportGeneration: prepared.expectedTransportGeneration,
          scope: "progression-and-preview",
          requiredPostcondition: "zero-future-attack",
        });
      } catch {
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "retirement-protocol-invalid",
        });
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "X1-replacement-retirement";
        } = Object.freeze({
          boundary: "X1-replacement-retirement",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "transport.replacement_retirement_evidence_invalid",
            path: Object.freeze([] as const),
          }),
          state: request.currentState,
          retirementDisposition: "reconciliation-required",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
          protocolDiagnostic: diagnostic,
        });
      }

      if (
        !isPlainRecord(retireResRaw) ||
        typeof retireResRaw["ok"] !== "boolean"
      ) {
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "retirement-protocol-invalid",
        });
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "X1-replacement-retirement";
        } = Object.freeze({
          boundary: "X1-replacement-retirement",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "transport.replacement_retirement_evidence_invalid",
            path: Object.freeze([] as const),
          }),
          state: request.currentState,
          retirementDisposition: "reconciliation-required",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
          protocolDiagnostic: diagnostic,
        });
      }

      if (retireResRaw.ok === false) {
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "retirement-refused",
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: retireResRaw["code"] as any,
            path: Object.freeze([] as const),
          }),
          state: request.currentState,
          retirementDisposition: "unchanged",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
        });
      }

      const retirementEvidence = retireResRaw["value"] as X1ReplacementRetirementEvidence;

      let pubResRaw: unknown;
      try {
        pubResRaw = await dependencies.publishImportReplacement({
          prepared,
          retirement: retirementEvidence.receipt,
        });
      } catch {
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "publication-protocol-invalid",
        });
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A0-replacement-publication";
        } = Object.freeze({
          boundary: "A0-replacement-publication",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "import.replacement_publication_result_invalid",
            path: Object.freeze([] as const),
          }),
          lastKnownState: request.currentState,
          retirementDisposition: "retired-reconciliation-required",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
          protocolDiagnostic: diagnostic,
        });
      }

      if (
        !isPlainRecord(pubResRaw) ||
        pubResRaw["ok"] !== true ||
        pubResRaw["outcome"] !== "committed"
      ) {
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "publication-protocol-invalid",
        });
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A0-replacement-publication";
        } = Object.freeze({
          boundary: "A0-replacement-publication",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: "import.replacement_publication_result_invalid",
            path: Object.freeze([] as const),
          }),
          lastKnownState: request.currentState,
          retirementDisposition: "retired-reconciliation-required",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
          protocolDiagnostic: diagnostic,
        });
      }

      const publicationResult = pubResRaw as PublishImportReplacementResult;

      return Object.freeze({
        ok: true,
        outcome: "committed",
        retirementEvidence,
        publication: publicationResult,
        preparationDisposition: "consumed",
        commitCount: 1,
        migrationReexecutionAuthorized: false,
        parseReexecutionAuthorized: false,
      });
    },
    prepareCanonicalExportDelivery: async (
      request: PrepareCanonicalExportDeliveryRequest,
    ): Promise<PrepareCanonicalExportDeliveryResult> => {
      const beginRes = deliveryRegistry.begin({
        documentId: request.state.document.id,
        revision: request.state.revision,
      });
      if (!beginRes.ok) {
        return Object.freeze({
          ok: false,
          outcome: "preparation-unavailable",
          code: beginRes.code,
        });
      }

      let exportResRaw: unknown;
      try {
        exportResRaw = await dependencies.canonicalExportDelivery.prepareCanonicalJsonExport({
          document: request.state.document,
        });
      } catch {
        deliveryRegistry.abandonPreparation(beginRes.identity.preparationId);
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "canonical-export-preparation";
        } = Object.freeze({
          boundary: "canonical-export-preparation",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        });
        return Object.freeze({
          ok: false,
          outcome: "preparation-protocol-invalid",
          code: "export.prepared_canonical_artifact_invalid",
          protocolDiagnostic: diagnostic,
          configurationDisposition: "release-gate-failed",
        });
      }

      if (
        !isPlainRecord(exportResRaw) ||
        typeof exportResRaw["ok"] !== "boolean"
      ) {
        deliveryRegistry.abandonPreparation(beginRes.identity.preparationId);
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "canonical-export-preparation";
        } = Object.freeze({
          boundary: "canonical-export-preparation",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        });
        return Object.freeze({
          ok: false,
          outcome: "preparation-protocol-invalid",
          code: "export.prepared_canonical_artifact_invalid",
          protocolDiagnostic: diagnostic,
          configurationDisposition: "release-gate-failed",
        });
      }

      if (!exportResRaw.ok) {
        deliveryRegistry.abandonPreparation(beginRes.identity.preparationId);
        return Object.freeze({
          ok: false,
          outcome: "canonical-export-refused",
          refusal: exportResRaw["refusal"] as any,
        });
      }

      const artifact = exportResRaw["value"] as any;
      const binding: CanonicalExportPreparationBinding = Object.freeze({
        preparationId: beginRes.identity.preparationId,
        generation: beginRes.identity.generation,
        documentId: beginRes.identity.documentId,
        revision: beginRes.identity.revision,
        filename: artifact.filename,
        byteLength: artifact.byteLength,
        semanticDocumentHash: artifact.semanticDocumentHash,
        canonicalPolicyVersion: 1,
        semanticHashPolicyVersion: 1,
      });

      const prepDelivery: PreparedCanonicalExportDelivery = Object.freeze({
        schema: PREPARED_CANONICAL_EXPORT_DELIVERY_SCHEMA,
        identity: beginRes.identity,
        binding: Object.freeze({
          kind: "canonical-json" as const,
          sourceDocumentId: artifact.sourceDocumentId,
          filename: artifact.filename,
          byteLength: artifact.byteLength,
          semanticDocumentHash: artifact.semanticDocumentHash,
        }),
        privateBytes: new TextEncoder().encode(artifact.text),
      });

      deliveryRegistry.publish(prepDelivery);

      return Object.freeze({
        ok: true,
        outcome: "prepared",
        binding,
      });
    },
    completeCanonicalExportMarkerSettlement: async (
      request: CompleteCanonicalExportMarkerSettlementRequest,
    ): Promise<CompleteCanonicalExportMarkerSettlementResult> => {
      const takeRes = deliveryRegistry.take({
        preparationId: request.preparationId,
        stateIdentity: {
          documentId: request.state.document.id,
          revision: request.state.revision,
        },
      });

      if (takeRes.outcome === "discarded-stale") {
        return Object.freeze({
          outcome: "prepared-export-stale",
          code: "export.prepared_canonical_stale",
          delivery: null,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      if (takeRes.outcome === "unavailable" || takeRes.value === null) {
        return Object.freeze({
          outcome: "prepared-export-unavailable",
          code: "export.prepared_canonical_unavailable",
          delivery: null,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      const preparedDelivery = takeRes.value;

      let deliveryCompletion: unknown;
      try {
        const startResult = dependencies.canonicalExportDelivery.startPreparedExportDelivery({
          binding: preparedDelivery.binding,
          privateBytes: preparedDelivery.privateBytes,
          preference: request.deliveryPreference,
        });
        if (
          isPlainRecord(startResult) &&
          "completion" in startResult &&
          startResult["completion"] instanceof Promise
        ) {
          deliveryCompletion = await startResult["completion"];
        } else if (startResult instanceof Promise) {
          deliveryCompletion = await startResult;
        } else {
          deliveryCompletion = startResult;
        }
      } catch {
        deliveryRegistry.finishDelivery(request.preparationId);
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "export-delivery";
        } = Object.freeze({
          boundary: "export-delivery",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        });
        return Object.freeze({
          outcome: "delivery-protocol-invalid",
          code: "export.delivery_result_invalid",
          delivery: null,
          a0Publication: null,
          a1Persistence: null,
          protocolDiagnostic: diagnostic,
          configurationDisposition: "release-gate-failed",
          durability: "unchanged",
        });
      }

      deliveryRegistry.finishDelivery(request.preparationId);

      if (
        !isPlainRecord(deliveryCompletion) ||
        typeof deliveryCompletion["ok"] !== "boolean"
      ) {
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "export-delivery";
        } = Object.freeze({
          boundary: "export-delivery",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        });
        return Object.freeze({
          outcome: "delivery-protocol-invalid",
          code: "export.delivery_result_invalid",
          delivery: null,
          a0Publication: null,
          a1Persistence: null,
          protocolDiagnostic: diagnostic,
          configurationDisposition: "release-gate-failed",
          durability: "unchanged",
        });
      }

      if (
        deliveryCompletion["outcome"] !== "completed" &&
        deliveryCompletion["outcome"] !== "handed-off"
      ) {
        return Object.freeze({
          outcome: "delivery-terminal",
          delivery: deliveryCompletion as any,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      const delivery = deliveryCompletion as MarkerEligibleCanonicalExportDelivery;

      // Settlement stage: A0 publication
      const pubReq: PublishCanonicalExportRevisionRequest = Object.freeze({
        publication: Object.freeze({
          schema: CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA,
          documentId: delivery.artifact.sourceDocumentId,
          revision: request.state.revision,
        }),
      });

      let pubRaw: unknown;
      try {
        pubRaw = dependencies.canonicalExportMarkerSettlement.publishCanonicalExportRevision(
          pubReq,
        );
      } catch {
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A0-marker-publication";
        } = Object.freeze({
          boundary: "A0-marker-publication",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        });
        return Object.freeze({
          outcome: "publication-protocol-invalid",
          code: "export.marker_publication_result_invalid",
          delivery,
          a0Publication: Object.freeze({
            request: pubReq,
            protocolDiagnostic: diagnostic,
          }),
          a1Persistence: null,
          applicationReconciliation: "required",
          durability: "unchanged",
        });
      }

      if (!isPlainRecord(pubRaw) || typeof pubRaw["ok"] !== "boolean") {
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A0-marker-publication";
        } = Object.freeze({
          boundary: "A0-marker-publication",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        });
        return Object.freeze({
          outcome: "publication-protocol-invalid",
          code: "export.marker_publication_result_invalid",
          delivery,
          a0Publication: Object.freeze({
            request: pubReq,
            protocolDiagnostic: diagnostic,
          }),
          a1Persistence: null,
          applicationReconciliation: "required",
          durability: "unchanged",
        });
      }

      if (!pubRaw.ok) {
        return Object.freeze({
          outcome: "publication-refused",
          delivery,
          a0Publication: Object.freeze({
            request: pubReq,
            result: pubRaw as any,
          }),
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      const a0Publication = Object.freeze({
        request: pubReq,
        result: pubRaw as Extract<PublishCanonicalExportRevisionResult, { ok: true }>,
      });

      // A1 persistence stage
      let timestampRaw: unknown;
      try {
        timestampRaw = dependencies.canonicalExportDelivery.readExportTimestamp();
      } catch {
        return Object.freeze({
          outcome: "advanced",
          delivery,
          a0Publication,
          a1Persistence: Object.freeze({
            handoff: null as any,
            result: Object.freeze({
              ok: false,
              outcome: "failed",
              code: "recovery.marker_persistence_failed",
              durability: "pending-failed",
            }),
          }),
          durability: "pending-failed",
        });
      }

      const exportedAt = typeof timestampRaw === "string" ? timestampRaw : new Date().toISOString();

      const persistHandoff = Object.freeze({
        schema: "changes.canonical-export-marker-persistence-handoff.v1" as const,
        marker: Object.freeze({
          documentId: delivery.artifact.sourceDocumentId,
          revision: request.state.revision,
          exportedAt,
          semanticDocumentHash: delivery.artifact.semanticDocumentHash,
          canonicalPolicyVersion: 1 as const,
          semanticHashPolicyVersion: 1 as const,
        }),
        artifact: Object.freeze({
          kind: "canonical-json" as const,
          sourceDocumentId: delivery.artifact.sourceDocumentId,
          byteLength: delivery.artifact.byteLength,
          filename: delivery.artifact.filename,
          semanticDocumentHash: delivery.artifact.semanticDocumentHash,
          canonicalPolicyVersion: 1 as const,
          semanticHashPolicyVersion: 1 as const,
        }),
      });

      let persistRaw: unknown;
      try {
        persistRaw = await dependencies.canonicalExportMarkerSettlement.queueCanonicalExportMarkerPersistence(
          persistHandoff,
        );
      } catch {
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A1-marker-persistence";
        } = Object.freeze({
          boundary: "A1-marker-persistence",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        });
        return Object.freeze({
          outcome: "persistence-protocol-invalid",
          code: "recovery.marker_persistence_result_invalid",
          delivery,
          a0Publication,
          a1Persistence: Object.freeze({
            handoff: persistHandoff,
            protocolDiagnostic: diagnostic,
          }),
          durability: "reconciliation-required",
        });
      }

      if (!isPlainRecord(persistRaw) || typeof persistRaw["ok"] !== "boolean") {
        const diagnostic: E0AdapterProtocolDiagnostic & {
          boundary: "A1-marker-persistence";
        } = Object.freeze({
          boundary: "A1-marker-persistence",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        });
        return Object.freeze({
          outcome: "persistence-protocol-invalid",
          code: "recovery.marker_persistence_result_invalid",
          delivery,
          a0Publication,
          a1Persistence: Object.freeze({
            handoff: persistHandoff,
            protocolDiagnostic: diagnostic,
          }),
          durability: "reconciliation-required",
        });
      }

      if (persistRaw.ok === true) {
        return Object.freeze({
          outcome: "advanced",
          delivery,
          a0Publication,
          a1Persistence: Object.freeze({
            handoff: persistHandoff,
            result: persistRaw as any,
          }),
          durability: "recovery-persisted",
        });
      }

      return Object.freeze({
        outcome: "advanced",
        delivery,
        a0Publication,
        a1Persistence: Object.freeze({
          handoff: persistHandoff,
          result: persistRaw as any,
        }),
        durability: "pending-failed",
      });
    },
  });
}
