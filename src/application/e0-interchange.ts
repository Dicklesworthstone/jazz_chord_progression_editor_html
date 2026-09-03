import {
  type AutoVoicing,
  type ChordEvent,
  type ChordEventId,
  type DocumentId,
  type DomainPath,
  type MeasureId,
  type ParsedChordEvent,
  type ProgressionDocumentShapeV2,
  type SectionId,
  type StableIdFactory,
  type ValidatedDocument,
} from "../domain";
import {
  CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA,
  type ImportNonUndoableConfirmationRequirement,
  type PreparedImportReplacementPublication,
  type PublishCanonicalExportRevisionRequest,
} from "./application-interchange-owner-contract";
import {
  type AppRevision,
  type ReplacementRetirementReceipt,
} from "./application-state-contract";
import {
  isNonnegativeSafeInteger,
} from "./application-state-helpers";
import {
  CHART_IMPORT_DEFAULTS,
  CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
  IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
  IMPORT_PREVIEW_POLICY_ID,
  IMPORT_PREVIEW_POLICY_VERSION,
  IMPORT_PREVIEW_SCHEMA,
  IMPORT_PUBLIC_PATH_FIELDS,
  MAX_CANONICAL_EXPORT_PREPARATION_ID,
  MAX_E0_CHART_IMPORT_ID_REQUESTS,
  MAX_IMPORT_PUBLIC_PATH_INDEX,
  MAX_IMPORT_PUBLIC_PATH_SEGMENTS,
  PREPARED_CANONICAL_EXPORT_DELIVERY_SCHEMA,
  type AbandonCanonicalExportPreparationResult,
  type BeginCanonicalExportPreparationResult,
  type BuildChartDocumentCandidate,
  type CanonicalExportMarkerOrchestrationDependencies,
  type CanonicalExportPreparationBinding,
  type CanonicalExportPreparationId,
  type CanonicalExportPreparationIdentity,
  type ClassifyJsonLexically,
  type ClassifyJsonLexicallyResult,
  type CommitImportReplacementDependencies,
  type CommitImportReplacementRequest,
  type CommitImportReplacementResult,
  type CompleteCanonicalExportMarkerSettlementRequest,
  type CompleteCanonicalExportMarkerSettlementResult,
  type DecodeUtf8Fatal,
  type DecodeUtf8FatalResult,
  type E0AdapterProtocolDiagnostic,
  type E0InterchangeOperations,
  type ExplicitlyUnavailableImportPreview,
  type FinishPreparedCanonicalExportDeliveryResult,
  type ImportIssue,
  type ImportIssueCode,
  type ImportIssueSummary,
  type ImportFormatHint,
  type ImportNonUndoableConfirmationSeed,
  type ImportPayload,
  type ImportPreviewReport,
  type ImportPreviewReportItem,
  type ImportPreviewSummary,
  type ImportPublicPath,
  type ImportReplacementCommandSeed,
  type ImportReplacementImpact,
  type ImportPublicPathField,
  type ImportSourceFormat,
  type ImportStage,
  type JsonLexicalRoute,
  type LegacyMigrationRefusalProjection,
  type MarkerEligibleCanonicalExportDelivery,
  type ParseJsonData,
  type ParseJsonDataResult,
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
  type PublishPreparedCanonicalExportDeliveryResult,
  type QueueCanonicalExportMarkerPersistenceResult,
  type ReadImportSource,
  type ReadImportSourceRequest,
  type ReadImportSourceResult,
  type RetainedImportPreview,
  type TakePreparedCanonicalExportDeliveryResult,
  type X1ReplacementRetirementEvidence,
} from "./e0-interchange-contract";
import type { PrepareImportPreviewRequestV2 } from "./e0-interchange-v2-contract";
import type { LegacyMigrationRefusal } from "../compatibility";

/* TS narrows `signal.aborted` to false after the first guard and keeps the
 * narrowing across awaits, which is unsound for an AbortSignal; reading it
 * through a call keeps the post-await re-checks honest. */
function signalAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}
import type {
  ChartTextDraft,
  SourceRange,
} from "../theory";
import type { CanonicalJsonArtifact, ExportDeliveryResult } from "../export";

/* Total projection of a C0 legacy-migration refusal into its public shape:
 * the real refusal code always survives; collision ids and raw source stay
 * private per the projection contract. */
function projectLegacyRefusal(
  refusal: LegacyMigrationRefusal,
): LegacyMigrationRefusalProjection {
  const path = projectPublicPath(refusal.path);
  if (refusal.code === "legacy.id_factory_failed") {
    return Object.freeze({
      code: refusal.code,
      path,
      detail: Object.freeze({
        kind: "id-factory" as const,
        idKind: refusal.kind,
        factoryCode: refusal.factoryCode,
      }),
    });
  }
  if (refusal.code === "legacy.id_collision") {
    return Object.freeze({
      code: refusal.code,
      path,
      detail: Object.freeze({
        kind: "id-collision" as const,
        idKind: refusal.kind,
        firstSourcePath: projectPublicPath(refusal.firstSourcePath),
      }),
    });
  }
  if ("maximum" in refusal) {
    return Object.freeze({
      code: refusal.code,
      path,
      detail: Object.freeze({
        kind: "limit" as const,
        received: refusal.received,
        maximum: refusal.maximum,
      }),
    });
  }
  return Object.freeze({ code: refusal.code, path, detail: null });
}

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
    if (signalAborted(signal)) {
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

  if (signalAborted(signal)) {
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
            start: strToken.start,
            end: strToken.end,
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
    const value: unknown = JSON.parse(sourceText);
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
  let collisionOccurred = false;
  let limitExceeded = false;

  const nextId = (kind: "document" | "section" | "measure" | "event"): string | null => {
    requestCount++;
    if (requestCount > MAX_E0_CHART_IMPORT_ID_REQUESTS) {
      limitExceeded = true;
      return null;
    }
    const res = idFactory.next(kind);
    if (!res.ok) {
      return null;
    }
    if (existingIds.has(res.value)) {
      collisionOccurred = true;
      return null;
    }
    existingIds.add(res.value);
    return res.value;
  };

  const makeIdRefusal = (path: readonly (string | number)[]) => {
    if (limitExceeded) {
      return Object.freeze({
        ok: false,
        code: "limit.chart_import_id_requests_exceeded" as const,
        path: Object.freeze([...path]),
        received: 73_794 as const,
        maximum: MAX_E0_CHART_IMPORT_ID_REQUESTS,
      });
    }
    if (collisionOccurred) {
      return Object.freeze({
        ok: false,
        code: "import.chart_id_collision" as const,
        path: Object.freeze([...path]),
      });
    }
    return Object.freeze({
      ok: false,
      code: "import.chart_id_factory_failed" as const,
      path: Object.freeze([...path]),
    });
  };

  const docId = nextId("document");
  if (docId === null) {
    return makeIdRefusal([]);
  }

  const sections: Array<ProgressionDocumentShapeV2["sections"][number]> = [];
  for (let sIdx = 0; sIdx < draft.sections.length; sIdx++) {
    const sDraft = draft.sections[sIdx];
    if (!sDraft) continue;
    const secId = nextId("section");
    if (secId === null) {
      return makeIdRefusal(["sections", sIdx]);
    }

    const measures: Array<ProgressionDocumentShapeV2["sections"][number]["measures"][number]> = [];
    for (let mIdx = 0; mIdx < sDraft.measures.length; mIdx++) {
      const mDraft = sDraft.measures[mIdx];
      if (!mDraft) continue;
      const measId = nextId("measure");
      if (measId === null) {
        return makeIdRefusal(["sections", sIdx, "measures", mIdx]);
      }

      const events: Array<ProgressionDocumentShapeV2["sections"][number]["measures"][number]["events"][number]> = [];
      for (let eIdx = 0; eIdx < mDraft.events.length; eIdx++) {
        const eDraft = mDraft.events[eIdx];
        if (!eDraft) continue;
        const evId = nextId("event");
        if (evId === null) {
          return makeIdRefusal(["sections", sIdx, "measures", mIdx, "events", eIdx]);
        }

        const autoVoicing = CHART_IMPORT_DEFAULTS.autoVoicing as AutoVoicing;
        const chordEv: ChordEvent =
          eDraft.chord.bass === null
            ? (Object.freeze({
                id: evId as unknown as ChordEventId,
                duration: eDraft.duration,
                annotation: eDraft.annotation,
                chord: eDraft.chord,
                voicing: autoVoicing,
              }) as unknown as ParsedChordEvent)
            : (Object.freeze({
                id: evId as unknown as ChordEventId,
                duration: eDraft.duration,
                annotation: eDraft.annotation,
                chord: eDraft.chord,
                voicing: autoVoicing,
              }) as unknown as ParsedChordEvent);
        events.push(chordEv);
      }

      measures.push(
        Object.freeze({
          id: measId as unknown as MeasureId,
          events: Object.freeze(events),
          completion: Object.freeze({ kind: "complete" as const }),
        }),
      );
    }

    sections.push(
      Object.freeze({
        id: secId as unknown as SectionId,
        name: sDraft.name ?? `Section ${String(sIdx + 1)}`,
        annotation: sDraft.annotation,
        keyOverride: null,
        voiceLeadingBoundary: "reset" as const,
        measures: Object.freeze(measures),
      }),
    );
  }

  const shape: ProgressionDocumentShapeV2 = Object.freeze({
    schema: "changes.progression.v2" as const,
    id: docId as DocumentId,
    title: draft.headers.title ?? CHART_IMPORT_DEFAULTS.title,
    description: draft.headers.description ?? CHART_IMPORT_DEFAULTS.description,
    meter: draft.headers.meter ?? Object.freeze({ beatsPerBar: 4 as const, beatUnit: 4 as const }),
    tempoBpm: draft.headers.tempoBpm ?? CHART_IMPORT_DEFAULTS.tempoBpm,
    key: draft.headers.key ?? null,
    sections: Object.freeze(sections),
    playback: CHART_IMPORT_DEFAULTS.playback,
  });

  return Object.freeze({ ok: true, value: shape });
};

/**
 * The impact resolver is the single point where v1 and v2 previews differ:
 * v1 recomputes the disclosure from the state-bearing impact context after
 * the candidate exists; v2 (E0V2-RES-02) receives the composition-computed
 * projection with an application-allocated command seed, and the owner
 * recomputes at preparation — the projection is never authority.
 */
type ResolvePreviewImpact = (
  candidate: ValidatedDocument,
) =>
  | Readonly<{
      ok: true;
      impact: ImportReplacementImpact;
      command: ImportReplacementCommandSeed;
    }>
  | Readonly<{ ok: false }>;

function runPrepareImportPreview(
  dependencies: Omit<
    PrepareImportPreviewDependencies,
    "assessImportReplacementImpact"
  >,
  payload: ImportPayload,
  formatHint: ImportFormatHint,
  confirmationSeed: ImportNonUndoableConfirmationSeed,
  resolveImpact: ResolvePreviewImpact,
): PrepareImportPreviewResult {
  {

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

    const preflight = dependencies.preflightDocumentImportBytes(payload.bytes.byteLength);
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

    let candidateDoc: ValidatedDocument;
    let sourceFormat: ImportSourceFormat;
    let origin: "canonical-import" | "legacy-import";
    const reportItems: ImportPreviewReportItem[] = [];

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
      if (route === "unsupported-schema") {
        return makeRefusal(
          "import.schema_unsupported",
          "schema-route",
          Object.freeze(["schema"] as const),
        );
      }
      if (route === "future-canonical") {
        return makeRefusal(
          "import.future_schema_unsupported",
          "schema-route",
          Object.freeze(["schema"] as const),
        );
      }
      if (route === "unversioned-unrecognized") {
        return makeRefusal(
          "import.json_shape_unrecognized",
          "schema-route",
          Object.freeze([] as const),
        );
      }
      if (route === "host-parse-to-diagnose-malformed") {
        const parsed = dependencies.parseJsonData(text);
        if (!parsed.ok) {
          return makeRefusal(
            parsed.code,
            "json-parse-or-legacy-migration",
            Object.freeze([] as const),
            parsed.range,
          );
        }
        return makeRefusal(
          "import.json_shape_unrecognized",
          "schema-route",
          Object.freeze([] as const),
        );
      }

      if (route === "canonical-v2") {
        const parsed = dependencies.parseJsonData(text);
        if (!parsed.ok) {
          return makeRefusal(
            parsed.code,
            "json-parse-or-legacy-migration",
            Object.freeze([] as const),
            parsed.range,
          );
        }

        const decoded = dependencies.decodeDocumentShape(parsed.value);
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
        sourceFormat = "canonical-json-v2";
        origin = "canonical-import";
      } else {
        const legacyRes = dependencies.migrateLegacyJson(
          Object.freeze({ sourceBytes: payload.bytes }),
          dependencies.legacyMigrationDependencies,
        );
        if (!legacyRes.ok) {
          const projectedLegacyRefusal = projectLegacyRefusal(
            legacyRes.refusal,
          );
          return makeRefusal(
            "import.legacy_refused",
            "json-parse-or-legacy-migration",
            projectedLegacyRefusal.path,
            null,
            [],
            projectedLegacyRefusal,
          );
        }

        const legacyCand = legacyRes.value;
        const decoded = dependencies.decodeDocumentShape(legacyCand.document);
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

        const allGroups = [
          legacyCand.report.groups.preserved,
          legacyCand.report.groups.canonicalized,
          legacyCand.report.groups.custom,
          legacyCand.report.groups.ignored,
          legacyCand.report.groups.rejected,
        ];
        for (const groupItems of allGroups) {
          for (const item of groupItems) {
            reportItems.push(
              Object.freeze({
                code: item.code,
                sourcePath: projectPublicPath(item.sourcePath),
                targetPath: item.targetPath ? projectPublicPath(item.targetPath) : null,
              }),
            );
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
          parseRes.diagnostics[0].range,
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

    const impactRes = resolveImpact(candidateDoc);
    if (!impactRes.ok) {
      return makeRefusal(
        "import.replacement_impact_unavailable",
        "preview-publication",
      );
    }
    const impact = impactRes.impact;
    const commandSeed = impactRes.command;

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
      schema: IMPORT_PREVIEW_SCHEMA as typeof IMPORT_PREVIEW_SCHEMA,
      policyId: IMPORT_PREVIEW_POLICY_ID as typeof IMPORT_PREVIEW_POLICY_ID,
      policyVersion: IMPORT_PREVIEW_POLICY_VERSION as typeof IMPORT_PREVIEW_POLICY_VERSION,
      identity: payload.identity,
      sourceFormat,
      replacementOrigin: origin,
      candidate: candidateDoc,
      summary: previewSummary,
      issues,
      report,
      replacementCommandSeed: commandSeed,
      rawSourceRetained: false as const,
      autoApplyAuthorized: false as const,
    };

    if (impact.undoDisposition === "retained") {
      const preview: RetainedImportPreview = Object.freeze({
        ...basePreview,
        replacementImpact: impact,
        nonUndoableConfirmationRequirement: null,
      });
      return Object.freeze({ ok: true, value: preview });
    } else {
      const req: ImportNonUndoableConfirmationRequirement = Object.freeze({
        schema: IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
        confirmationId: confirmationSeed.confirmationId,
        identity: payload.identity,
        candidateDocumentId: candidateDoc.id,
        commandId: commandSeed.id,
        disclosedImpact: impact,
      });
      const preview: ExplicitlyUnavailableImportPreview = Object.freeze({
        ...basePreview,
        replacementImpact: impact,
        nonUndoableConfirmationRequirement: req,
      });
      return Object.freeze({ ok: true, value: preview });
    }
  }
}

export function createPrepareImportPreviewCoordinator(
  dependencies: PrepareImportPreviewDependencies,
): PrepareImportPreview {
  return (request: PrepareImportPreviewRequest): PrepareImportPreviewResult =>
    runPrepareImportPreview(
      dependencies,
      request.payload,
      request.formatHint,
      request.nonUndoableConfirmationSeed,
      (candidate) => {
        const assessed = dependencies.assessImportReplacementImpact(
          request.replacementImpactContext,
          candidate,
        );
        if (!assessed.ok) return Object.freeze({ ok: false as const });
        return Object.freeze({
          ok: true as const,
          impact: assessed.value,
          command: request.replacementImpactContext.command,
        });
      },
    );
}

/**
 * E0V2-RES-02 production preview: state-free request; the disclosure is
 * the composition-computed projection and the displayed command seed is
 * application-allocated before the preview (the same provenance rule as
 * the confirmation seed — the preview cannot mint either token).
 */
export function createPrepareImportPreviewCoordinatorV2(
  dependencies: Omit<
    PrepareImportPreviewDependencies,
    "assessImportReplacementImpact"
  >,
  allocateReplacementCommandSeed: () => ImportReplacementCommandSeed,
): (request: PrepareImportPreviewRequestV2) => PrepareImportPreviewResult {
  return (request: PrepareImportPreviewRequestV2): PrepareImportPreviewResult =>
    runPrepareImportPreview(
      dependencies,
      request.payload,
      request.formatHint,
      request.nonUndoableConfirmationSeed,
      () =>
        Object.freeze({
          ok: true as const,
          impact: request.replacementImpactProjection,
          command: allocateReplacementCommandSeed(),
        }),
    );
}

/* The v2 transaction driver lives in ./e0-transaction-driver: the accepted
 * v2 amendment requires every fallible owner-port return to pass exact-key
 * normalization (./e0-v2-port-normalization) and the confirmation binding
 * to prove a full requirement byte-match before the owner call. A driver
 * consuming trusted Operations types cannot satisfy either law. */

export function createPreparedCanonicalExportDeliveryRegistry(): PreparedCanonicalExportDeliveryRegistry {
  let registryState: PreparedCanonicalExportRegistryState = "empty";
  let currentPreparationId = 1 as CanonicalExportPreparationId;
  let currentGeneration = 1;
  let storedDelivery: PreparedCanonicalExportDelivery | null = null;
  let activeIdentity: CanonicalExportPreparationIdentity | null = null;

  return Object.freeze({
    begin: (
      stateIdentity: Readonly<{ documentId: DocumentId; revision: AppRevision }>,
    ): BeginCanonicalExportPreparationResult => {
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
          state: registryState === "ready" ? "empty" : registryState,
        });
      }
      const prepId = currentPreparationId;
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
    publish: (
      value: PreparedCanonicalExportDelivery,
    ): PublishPreparedCanonicalExportDeliveryResult => {
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
    take: (
      request: Readonly<{
        preparationId: CanonicalExportPreparationId;
        stateIdentity: Readonly<{
          documentId: DocumentId;
          revision: AppRevision;
        }>;
      }>,
    ): TakePreparedCanonicalExportDeliveryResult => {
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
    abandonPreparation: (
      preparationId: CanonicalExportPreparationId,
    ): AbandonCanonicalExportPreparationResult => {
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
    finishDelivery: (
      preparationId: CanonicalExportPreparationId,
    ): FinishPreparedCanonicalExportDeliveryResult => {
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
  dependencies: CommitImportReplacementDependencies &
    CanonicalExportMarkerOrchestrationDependencies & {
      prepareImportPreview: PrepareImportPreviewDependencies;
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

      if (!prepResRaw["ok"]) {
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: String(prepResRaw["code"]) as never,
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

      if (!retireResRaw["ok"]) {
        const invalidation = dependencies.discardImportReplacementPublication({
          identity,
          reason: "retirement-refused",
        });
        return Object.freeze({
          ok: false,
          refusal: Object.freeze({
            code: String(retireResRaw["code"]) as never,
            path: Object.freeze([] as const),
          }),
          state: request.currentState,
          retirementDisposition: "unchanged",
          preparationDisposition: "invalidated-by-request",
          preparationInvalidation: invalidation,
          publication: null,
        });
      }

      const rawRetirementEvidence = retireResRaw["value"] as X1ReplacementRetirementEvidence;
      const rawReceipt = rawRetirementEvidence.receipt;
      const retirementReceipt: ReplacementRetirementReceipt = Object.freeze({
        requestId: rawReceipt.requestId,
        retiredTransportGeneration: rawReceipt.retiredTransportGeneration,
        progressionRetired: true as const,
        previewRetired: true as const,
        noFutureAttack: true as const,
      });

      const retirementEvidence: X1ReplacementRetirementEvidence = Object.freeze({
        schema: "changes.x1-replacement-retirement-evidence.v1" as const,
        authority: "x1-serialized-transport" as const,
        request: rawRetirementEvidence.request,
        receipt: retirementReceipt,
      });

      let pubResRaw: unknown;
      try {
        pubResRaw = await dependencies.publishImportReplacement({
          prepared,
          retirement: retirementReceipt,
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
        !pubResRaw["ok"] ||
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
        exportResRaw = await dependencies.prepareCanonicalJsonExport({
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

      if (!exportResRaw["ok"]) {
        deliveryRegistry.abandonPreparation(beginRes.identity.preparationId);
        return Object.freeze({
          ok: false,
          outcome: "canonical-export-refused",
          refusal: exportResRaw["refusal"] as Extract<PrepareCanonicalExportDeliveryResult, { outcome: "canonical-export-refused" }>["refusal"],
        });
      }

      const artifact = exportResRaw["value"] as CanonicalJsonArtifact;
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

      if (takeRes.outcome === "unavailable") {
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
        const startResult = dependencies.startPreparedExportDelivery({
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
          cleanupKnowledge: "unknown",
          maximumPossibleOutstandingOwnedResources: 4,
          deliveryResourceReconciliation: "required",
          protocolDiagnostic: diagnostic,
          a0Publication: null,
          a1Persistence: null,
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
          cleanupKnowledge: "unknown",
          maximumPossibleOutstandingOwnedResources: 4,
          deliveryResourceReconciliation: "required",
          protocolDiagnostic: diagnostic,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      if (deliveryCompletion["outcome"] === "cancelled") {
        return Object.freeze({
          outcome: "unchanged-cancelled",
          delivery: deliveryCompletion as unknown as Extract<ExportDeliveryResult, { outcome: "cancelled" }>,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      if (deliveryCompletion["outcome"] === "failed") {
        return Object.freeze({
          outcome: "unchanged-failed",
          delivery: deliveryCompletion as unknown as Extract<ExportDeliveryResult, { outcome: "failed" }>,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      if (deliveryCompletion["outcome"] === "cleanup-failed") {
        return Object.freeze({
          outcome: "delivery-cleanup-reconciliation-required",
          code: "export.delivery_cleanup_failed",
          delivery: deliveryCompletion as unknown as Extract<ExportDeliveryResult, { outcome: "cleanup-failed" }>,
          deliveryResourceReconciliation: "required",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        });
      }

      if (
        deliveryCompletion["outcome"] !== "completed" &&
        deliveryCompletion["outcome"] !== "handed-off"
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
          cleanupKnowledge: "unknown",
          maximumPossibleOutstandingOwnedResources: 4,
          deliveryResourceReconciliation: "required",
          protocolDiagnostic: diagnostic,
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
        pubRaw = dependencies.settlementAdapters.publishCanonicalExportRevision(
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

      if (!pubRaw["ok"]) {
        return Object.freeze({
          outcome: "publication-refused",
          delivery,
          a0Publication: Object.freeze({
            request: pubReq,
            result: pubRaw as unknown as Extract<PublishCanonicalExportRevisionResult, { ok: false }>,
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
        timestampRaw = dependencies.readExportTimestamp();
      } catch {
        return Object.freeze({
          outcome: "advanced",
          delivery,
          a0Publication,
          a1Persistence: Object.freeze({
            handoff: Object.freeze({
              schema: "changes.canonical-export-marker-persistence-handoff.v1" as const,
              marker: Object.freeze({
                documentId: delivery.artifact.sourceDocumentId,
                revision: request.state.revision,
                exportedAt: new Date().toISOString(),
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
            }),
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
        persistRaw = await dependencies.settlementAdapters.queueCanonicalExportMarkerPersistence(
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
          a0Publication: Object.freeze({
            request: pubReq,
            result: a0Publication.result,
          }),
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
          a0Publication: Object.freeze({
            request: pubReq,
            result: a0Publication.result,
          }),
          a1Persistence: Object.freeze({
            handoff: persistHandoff,
            protocolDiagnostic: diagnostic,
          }),
          durability: "reconciliation-required",
        });
      }

      if (persistRaw["ok"]) {
        return Object.freeze({
          outcome: "advanced",
          delivery,
          a0Publication,
          a1Persistence: Object.freeze({
            handoff: persistHandoff,
            result: persistRaw as unknown as Extract<QueueCanonicalExportMarkerPersistenceResult, { ok: true }>,
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
          result: persistRaw as unknown as Extract<QueueCanonicalExportMarkerPersistenceResult, { ok: false }>,
        }),
        durability: "pending-failed",
      });
    },
  });
}
