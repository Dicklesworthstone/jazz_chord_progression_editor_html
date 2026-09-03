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

const HEX_DIGEST_REGEX = /^[0-9a-f]{64}$/;

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDegree(d: ChordDegree): string {
  return `{"number":${d.number},"alter":${d.alter}}`;
}

function formatDegreesArray(degrees: readonly ChordDegree[]): string {
  if (degrees.length === 0) return "[]";
  return `[${degrees.map(formatDegree).join(",")}]`;
}

function formatNumber(n: number): string {
  if (Object.is(n, -0)) return "-0";
  return String(n);
}

/**
 * Pure canonical JSON projection following CANONICAL_JSON_KEY_ORDER with 2-space indentation.
 */
export function serializeCanonicalJsonDocument(doc: ValidatedDocument): string {
  const lines: string[] = [];
  lines.push("{");
  lines.push(`  "schema": "changes.progression.v2",`);
  lines.push(`  "id": ${JSON.stringify(doc.id)},`);
  lines.push(`  "title": ${JSON.stringify(doc.title)},`);
  lines.push(`  "description": ${JSON.stringify(doc.description)},`);
  lines.push("  \"meter\": {");
  lines.push(`    "beatsPerBar": ${formatNumber(doc.meter.beatsPerBar)},`);
  lines.push(`    "beatUnit": ${formatNumber(doc.meter.beatUnit)}`);
  lines.push("  },");
  lines.push(`  "tempoBpm": ${formatNumber(doc.tempoBpm)},`);

  if (doc.key === null) {
    lines.push("  \"key\": null,");
  } else {
    lines.push("  \"key\": {");
    lines.push("    \"tonic\": {");
    lines.push(`      "step": ${JSON.stringify(doc.key.tonic.step)},`);
    lines.push(`      "alter": ${formatNumber(doc.key.tonic.alter)}`);
    lines.push("    },");
    lines.push(`    "mode": ${JSON.stringify(doc.key.mode)}`);
    lines.push("  },");
  }

  if (doc.sections.length === 0) {
    lines.push("  \"sections\": [],");
  } else {
    lines.push("  \"sections\": [");
    doc.sections.forEach((section, sIdx) => {
      const isLastSection = sIdx === doc.sections.length - 1;
      lines.push("    {");
      lines.push(`      "id": ${JSON.stringify(section.id)},`);
      lines.push(`      "name": ${JSON.stringify(section.name)},`);
      lines.push(`      "annotation": ${JSON.stringify(section.annotation)},`);

      if (section.keyOverride === null) {
        lines.push("      \"keyOverride\": null,");
      } else {
        lines.push("      \"keyOverride\": {");
        lines.push("        \"tonic\": {");
        lines.push(`          "step": ${JSON.stringify(section.keyOverride.tonic.step)},`);
        lines.push(`          "alter": ${formatNumber(section.keyOverride.tonic.alter)}`);
        lines.push("        },");
        lines.push(`        "mode": ${JSON.stringify(section.keyOverride.mode)}`);
        lines.push("      },");
      }

      lines.push(`      "voiceLeadingBoundary": ${JSON.stringify(section.voiceLeadingBoundary)},`);

      if (section.measures.length === 0) {
        lines.push("      \"measures\": []");
      } else {
        lines.push("      \"measures\": [");
        section.measures.forEach((measure, mIdx) => {
          const isLastMeasure = mIdx === section.measures.length - 1;
          lines.push("        {");
          lines.push(`          "id": ${JSON.stringify(measure.id)},`);

          if (measure.events.length === 0) {
            lines.push("          \"events\": [],");
          } else {
            lines.push("          \"events\": [");
            measure.events.forEach((event, eIdx) => {
              const isLastEvent = eIdx === measure.events.length - 1;
              lines.push("            {");
              lines.push(`              "id": ${JSON.stringify(event.id)},`);
              lines.push("              \"duration\": {");
              lines.push(`                "numerator": ${formatNumber(event.duration.numerator)},`);
              lines.push(`                "denominator": ${formatNumber(event.duration.denominator)}`);
              lines.push("              },");
              lines.push(`              "annotation": ${JSON.stringify(event.annotation)},`);
              lines.push("              \"chord\": {");

              if (event.chord.kind === "parsed") {
                const parsed = event.chord as ParsedChordSpec;
                lines.push(`                "kind": "parsed",`);
                lines.push(`                "sourceText": ${JSON.stringify(parsed.sourceText)},`);
                lines.push("                \"root\": {");
                lines.push(`                  "step": ${JSON.stringify(parsed.root.step)},`);
                lines.push(`                  "alter": ${formatNumber(parsed.root.alter)}`);
                lines.push("                },");
                lines.push(`                "triad": ${JSON.stringify(parsed.triad)},`);
                lines.push(`                "sixth": ${parsed.sixth === null ? "null" : formatDegree(parsed.sixth)},`);
                lines.push(`                "seventh": ${parsed.seventh === null ? "null" : JSON.stringify(parsed.seventh)},`);
                lines.push(`                "extensions": ${formatDegreesArray(parsed.extensions)},`);
                lines.push(`                "additions": ${formatDegreesArray(parsed.additions)},`);
                lines.push(`                "alterations": ${formatDegreesArray(parsed.alterations)},`);
                lines.push(`                "omissions": [${parsed.omissions.join(",")}],`);
                if (parsed.bass === null) {
                  lines.push("                \"bass\": null,");
                } else {
                  lines.push("                \"bass\": {");
                  lines.push(`                  "step": ${JSON.stringify(parsed.bass.step)},`);
                  lines.push(`                  "alter": ${formatNumber(parsed.bass.alter)}`);
                  lines.push("                },");
                }
                lines.push(`                "colorPolicy": ${JSON.stringify(parsed.colorPolicy)}`);
              } else {
                const custom = event.chord as CustomChordSpec;
                lines.push(`                "kind": "custom",`);
                lines.push(`                "sourceText": ${JSON.stringify(custom.sourceText)},`);
                lines.push(`                "label": ${JSON.stringify(custom.label)},`);
                if (custom.pitchNames.length === 0) {
                  lines.push("                \"pitchNames\": [],");
                } else {
                  lines.push("                \"pitchNames\": [");
                  custom.pitchNames.forEach((pn, pnIdx) => {
                    const isLastPn = pnIdx === custom.pitchNames.length - 1;
                    lines.push("                  {");
                    lines.push(`                    "step": ${JSON.stringify(pn.step)},`);
                    lines.push(`                    "alter": ${formatNumber(pn.alter)}`);
                    lines.push(`                  }${isLastPn ? "" : ","}`);
                  });
                  lines.push("                ],");
                }
                if (custom.bass === null) {
                  lines.push("                \"bass\": null");
                } else {
                  lines.push("                \"bass\": {");
                  lines.push(`                  "step": ${JSON.stringify(custom.bass.step)},`);
                  lines.push(`                  "alter": ${formatNumber(custom.bass.alter)}`);
                  lines.push("                }");
                }
              }

              lines.push("              },");
              lines.push("              \"voicing\": {");
              const voicing = event.voicing;
              if (voicing.mode === "auto") {
                lines.push(`                "mode": "auto",`);
                lines.push(`                "family": ${JSON.stringify(voicing.family)},`);
                lines.push(`                "voiceCount": ${formatNumber(voicing.voiceCount)},`);
                lines.push("                \"range\": {");
                lines.push(`                  "lowMidi": ${formatNumber(voicing.range.lowMidi)},`);
                lines.push(`                  "highMidi": ${formatNumber(voicing.range.highMidi)}`);
                lines.push("                },");
                lines.push(`                "bassPolicy": ${JSON.stringify(voicing.bassPolicy)}`);
              } else if (voicing.mode === "manual") {
                lines.push(`                "mode": "manual",`);
                if (voicing.pitches.length === 0) {
                  lines.push("                \"pitches\": [],");
                } else {
                  lines.push("                \"pitches\": [");
                  voicing.pitches.forEach((p, pIdx) => {
                    const isLastPitch = pIdx === voicing.pitches.length - 1;
                    lines.push("                  {");
                    lines.push(`                    "step": ${JSON.stringify(p.step)},`);
                    lines.push(`                    "alter": ${formatNumber(p.alter)},`);
                    lines.push(`                    "octave": ${formatNumber(p.octave)}`);
                    lines.push(`                  }${isLastPitch ? "" : ","}`);
                  });
                  lines.push("                ],");
                }
                lines.push(`                "bassPolicy": ${JSON.stringify(voicing.bassPolicy)}`);
              } else {
                lines.push(`                "mode": "frozen",`);
                if (voicing.pitches.length === 0) {
                  lines.push("                \"pitches\": [],");
                } else {
                  lines.push("                \"pitches\": [");
                  voicing.pitches.forEach((p, pIdx) => {
                    const isLastPitch = pIdx === voicing.pitches.length - 1;
                    lines.push("                  {");
                    lines.push(`                    "step": ${JSON.stringify(p.step)},`);
                    lines.push(`                    "alter": ${formatNumber(p.alter)},`);
                    lines.push(`                    "octave": ${formatNumber(p.octave)}`);
                    lines.push(`                  }${isLastPitch ? "" : ","}`);
                  });
                  lines.push("                ],");
                }
                lines.push(`                "bassPolicy": ${JSON.stringify(voicing.bassPolicy)},`);
                lines.push("                \"generatedBy\": {");
                lines.push(`                  "engineVersion": ${JSON.stringify(voicing.generatedBy.engineVersion)},`);
                lines.push(`                  "family": ${JSON.stringify(voicing.generatedBy.family)}`);
                lines.push("                }");
              }

              lines.push("              }");
              lines.push(`            }${isLastEvent ? "" : ","}`);
            });
            lines.push("          ],");
          }

          lines.push("          \"completion\": {");
          if (measure.completion.kind === "complete" || measure.completion.kind === "empty") {
            lines.push(`            "kind": ${JSON.stringify(measure.completion.kind)}`);
          } else {
            lines.push(`            "kind": ${JSON.stringify(measure.completion.kind)},`);
            lines.push("            \"expectedDuration\": {");
            lines.push(`              "numerator": ${formatNumber(measure.completion.expectedDuration.numerator)},`);
            lines.push(`              "denominator": ${formatNumber(measure.completion.expectedDuration.denominator)}`);
            lines.push("            },");
            lines.push(`            "reason": ${JSON.stringify(measure.completion.reason)}`);
          }
          lines.push("          }");
          lines.push(`        }${isLastMeasure ? "" : ","}`);
        });
        lines.push("      ]");
      }

      lines.push(`    }${isLastSection ? "" : ","}`);
    });
    lines.push("  ],");
  }

  lines.push("  \"playback\": {");
  lines.push(`    "instrumentId": ${JSON.stringify(doc.playback.instrumentId)},`);
  lines.push(`    "masterVolume": ${formatNumber(doc.playback.masterVolume)},`);
  lines.push(`    "reverbAmount": ${formatNumber(doc.playback.reverbAmount)},`);
  if (doc.playback.grooveStyleId !== undefined) {
    lines.push(`    "countInBars": ${formatNumber(doc.playback.countInBars)},`);
    lines.push(`    "grooveStyleId": ${JSON.stringify(doc.playback.grooveStyleId)}`);
  } else {
    lines.push(`    "countInBars": ${formatNumber(doc.playback.countInBars)}`);
  }
  lines.push("  }");
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

type ParsedChordSpec = Extract<ChordSpec, { kind: "parsed" }>;

export const sanitizeExportFilename: SanitizeExportFilename = (
  title: string,
  kind: ExportArtifactKind,
): SanitizedExportFilename => {
  const extension =
    kind === "canonical-json"
      ? CANONICAL_JSON_FILENAME_EXTENSION
      : LEAD_SHEET_TEXT_FILENAME_EXTENSION;
  const fallback =
    kind === "canonical-json"
      ? UNTITLED_CANONICAL_JSON_FILENAME
      : UNTITLED_LEAD_SHEET_TEXT_FILENAME;

  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return Object.freeze({
      basename: "untitled",
      filename: fallback,
      changed: true,
      usedFallback: true,
    });
  }

  const isForbidden = (cp: number): boolean => {
    if (
      (EXPORT_FILENAME_FORBIDDEN_CODE_POINTS as readonly number[]).includes(cp)
    ) {
      return true;
    }
    for (const range of EXPORT_FILENAME_FORBIDDEN_CODE_POINT_RANGES) {
      if (cp >= range.first && cp <= range.last) {
        return true;
      }
    }
    return false;
  };

  const codePoints = Array.from(title);
  let replaced = "";
  let inForbiddenRun = false;

  for (const char of codePoints) {
    const cp = char.codePointAt(0)!;
    if (isForbidden(cp)) {
      if (!inForbiddenRun) {
        replaced += "-";
        inForbiddenRun = true;
      }
    } else {
      inForbiddenRun = false;
      replaced += char;
    }
  }

  const extensionsToStrip = [
    ".changes.json",
    ".changes.txt",
    ".json",
    ".txt",
  ];
  let stripped = replaced;
  const lowerReplaced = replaced.toLowerCase();
  for (const ext of extensionsToStrip) {
    if (lowerReplaced.endsWith(ext)) {
      stripped = replaced.slice(0, replaced.length - ext.length);
      break;
    }
  }

  // Remove leading/trailing ASCII spaces and trailing dots
  let cleaned = stripped.replace(/^[ ]+/, "").replace(/[ .]+$/, "");

  // Truncate to 120 Unicode scalar values
  const chars = Array.from(cleaned);
  if (chars.length > MAX_EXPORT_FILENAME_BASENAME_CODE_POINTS) {
    cleaned = chars.slice(0, MAX_EXPORT_FILENAME_BASENAME_CODE_POINTS).join("");
    cleaned = cleaned.replace(/[ .]+$/, "");
  }

  if (cleaned.length === 0) {
    return Object.freeze({
      basename: "untitled",
      filename: fallback,
      changed: true,
      usedFallback: true,
    });
  }

  let finalBasename = cleaned;
  const firstComponent = cleaned.split(".")[0]?.toLowerCase() ?? "";
  if (
    (EXPORT_FILENAME_RESERVED_BASENAMES as readonly string[]).includes(
      firstComponent,
    )
  ) {
    finalBasename = `changes-${cleaned}`;
  }

  const filename = `${finalBasename}${extension}`;
  const changed = title !== finalBasename;

  return Object.freeze({
    basename: finalBasename,
    filename,
    changed,
    usedFallback: false,
  });
};

export function createCanonicalJsonExportCoordinator(
  dependencies: CanonicalJsonExportDependencies,
): PrepareCanonicalJsonExport {
  return async (
    request: PrepareCanonicalJsonExportRequest,
  ): Promise<CanonicalJsonExportResult> => {
    const text = serializeCanonicalJsonDocument(request.document);
    const encoded = new TextEncoder().encode(text);
    const byteLength = encoded.byteLength;

    if (byteLength > MAX_CANONICAL_JSON_EXPORT_BYTES) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.canonical_bytes_exceeded",
          path: Object.freeze([] as const),
          received: byteLength,
          maximum: MAX_CANONICAL_JSON_EXPORT_BYTES,
        }),
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.canonical_parse_failed",
          path: Object.freeze([] as const),
        }),
      });
    }

    const decoded = dependencies.decodeDocumentShape(parsed);
    if (!decoded.ok) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.canonical_structural_round_trip_failed",
          path: Object.freeze([...decoded.errors[0].path]) as DomainPath,
          issueCodes: Object.freeze(decoded.errors.map((e) => e.code)),
        }),
      });
    }

    const validated = dependencies.validateCanonicalRoundTrip(decoded.value);
    if (!validated.ok) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.canonical_semantic_round_trip_failed",
          path: Object.freeze([...validated.errors[0].path]) as DomainPath,
          issueCodes: Object.freeze(validated.errors.map((e) => e.code)),
        }),
      });
    }

    const semanticallyEqual = dependencies.semanticallyEqualDocuments(
      request.document,
      validated.value,
    );
    if (!semanticallyEqual) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.canonical_semantic_mismatch",
          path: Object.freeze([] as const),
        }),
      });
    }

    let hashResult: unknown;
    try {
      hashResult = await dependencies.hashBytes(encoded);
    } catch {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.hash_unavailable",
          path: Object.freeze([] as const),
        }),
      });
    }

    if (
      !isPlainRecord(hashResult) ||
      hashResult["ok"] !== true ||
      typeof hashResult["digest"] !== "string" ||
      !HEX_DIGEST_REGEX.test(hashResult["digest"])
    ) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "export.hash_unavailable",
          path: Object.freeze([] as const),
        }),
      });
    }

    const digest = hashResult["digest"] as SemanticDocumentHash;
    const sanitized = dependencies.sanitizeExportFilename(
      request.document.title,
      "canonical-json",
    );

    const artifact: CanonicalJsonArtifact = Object.freeze({
      schema: CANONICAL_JSON_ARTIFACT_SCHEMA,
      kind: "canonical-json",
      mediaType: CANONICAL_JSON_MEDIA_TYPE,
      filename: sanitized.filename,
      text,
      byteLength,
      semanticDocumentHash: digest,
      sourceDocumentId: request.document.id,
    });

    return Object.freeze({ ok: true, value: artifact });
  };
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
          const parsedChord = ev.chord as ParsedChordSpec;
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
