/**
 * E0 canonical JSON export (docs/E0_INTERCHANGE_CONTRACT.md sections 3-4;
 * production build jcpe-milestone-reliable-studio-l3a.8.2).
 *
 * The serializer is an EXPLICIT projection: it reads declared fields in the
 * exact CANONICAL_JSON_KEY_ORDER, never spreads the document, enumerates
 * runtime keys, calls toJSON, or consults prototypes. Output is two-space
 * indented with LF line endings and exactly one final LF, ordinary
 * ECMAScript string escaping, and the `-0` token wherever the persisted
 * number IS negative zero (JSON.stringify would silently write `0`).
 *
 * The coordinator offers bytes only after the contract's self-round-trip
 * gate: size law, one JSON.parse, one injected F2 decode, one injected F3
 * validation, one injected semantic equality, then the injected hash
 * boundary normalized to the exact HashBytesResult envelope. Every
 * dependency is independently owned; production output certifies nothing
 * about itself.
 */
import type {
  ChordDegree,
  ChordEvent,
  KeyContext,
  Measure,
  ProgressionDocumentV2,
  Section,
  SpelledPitch,
  SpelledPitchClass,
  Voicing,
} from "../domain";
import {
  CANONICAL_JSON_ARTIFACT_SCHEMA,
  CANONICAL_JSON_FILENAME_EXTENSION,
  CANONICAL_JSON_MEDIA_TYPE,
  EXPORT_FILENAME_FORBIDDEN_CODE_POINTS,
  EXPORT_FILENAME_FORBIDDEN_CODE_POINT_RANGES,
  EXPORT_FILENAME_RESERVED_BASENAMES,
  LEAD_SHEET_TEXT_FILENAME_EXTENSION,
  MAX_CANONICAL_JSON_EXPORT_BYTES,
  SEMANTIC_DOCUMENT_HASH_PATTERN_SOURCE,
  UNTITLED_CANONICAL_JSON_FILENAME,
  UNTITLED_LEAD_SHEET_TEXT_FILENAME,
  type CanonicalJsonExportDependencies,
  type CanonicalJsonExportResult,
  type ExportArtifactKind,
  type PrepareCanonicalJsonExportRequest,
  type SanitizedExportFilename,
  type SemanticDocumentHash,
} from "./interchange-contract";
const EMPTY_REFUSAL_PATH: readonly [] = Object.freeze([]);


/* ------------------------------------------------------------------ */
/* Canonical value writer                                             */
/* ------------------------------------------------------------------ */

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | Readonly<{ [key: string]: CanonicalValue }>;

function writeNumber(value: number): string {
  /* Finite domain numbers use ECMAScript's shortest JSON form except that
   * negative zero emits the valid JSON token `-0` (contract 3.1). */
  if (Object.is(value, -0)) return "-0";
  return JSON.stringify(value);
}

function writeValue(value: CanonicalValue, indent: string): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return writeNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map(
      (item) => `${inner}${writeValue(item as CanonicalValue, inner)}`,
    );
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  const record = value as Readonly<{ [key: string]: CanonicalValue }>;
  const keys = Object.keys(record);
  if (keys.length === 0) return "{}";
  const entries = keys.map(
    (key) =>
      `${inner}${JSON.stringify(key)}: ${writeValue(record[key] as CanonicalValue, inner)}`,
  );
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

/* ------------------------------------------------------------------ */
/* Explicit projection in CANONICAL_JSON_KEY_ORDER                    */
/* ------------------------------------------------------------------ */

function projectPitchClass(
  pitch: SpelledPitchClass,
): Readonly<{ [key: string]: CanonicalValue }> {
  return { step: pitch.step, alter: pitch.alter };
}

function projectPitch(
  pitch: SpelledPitch,
): Readonly<{ [key: string]: CanonicalValue }> {
  return { step: pitch.step, alter: pitch.alter, octave: pitch.octave };
}

function projectKey(
  key: KeyContext | null,
): CanonicalValue {
  if (key === null) return null;
  return { tonic: projectPitchClass(key.tonic), mode: key.mode };
}

function projectDegree(
  degree: ChordDegree,
): Readonly<{ [key: string]: CanonicalValue }> {
  return { number: degree.number, alter: degree.alter };
}

function projectBeat(
  beat: Readonly<{ numerator: number; denominator: number }>,
): Readonly<{ [key: string]: CanonicalValue }> {
  return { numerator: beat.numerator, denominator: beat.denominator };
}

function projectChord(chord: ChordEvent["chord"]): CanonicalValue {
  if (chord.kind === "custom") {
    return {
      kind: chord.kind,
      sourceText: chord.sourceText,
      label: chord.label,
      pitchNames: chord.pitchNames.map(projectPitchClass),
      bass: chord.bass === null ? null : projectPitchClass(chord.bass),
    };
  }
  return {
    kind: chord.kind,
    sourceText: chord.sourceText,
    root: projectPitchClass(chord.root),
    triad: chord.triad,
    sixth: chord.sixth === null ? null : projectDegree(chord.sixth),
    seventh: chord.seventh,
    extensions: chord.extensions.map(projectDegree),
    additions: chord.additions.map(projectDegree),
    alterations: chord.alterations.map(projectDegree),
    omissions: [...chord.omissions],
    bass: chord.bass === null ? null : projectPitchClass(chord.bass),
    colorPolicy: chord.colorPolicy,
  };
}

function projectVoicing(voicing: Voicing): CanonicalValue {
  if (voicing.mode === "auto") {
    return {
      mode: voicing.mode,
      family: voicing.family,
      voiceCount: voicing.voiceCount,
      range: {
        lowMidi: voicing.range.lowMidi,
        highMidi: voicing.range.highMidi,
      },
      bassPolicy: voicing.bassPolicy,
    };
  }
  if (voicing.mode === "manual") {
    return {
      mode: voicing.mode,
      pitches: voicing.pitches.map(projectPitch),
      bassPolicy: voicing.bassPolicy,
    };
  }
  return {
    mode: voicing.mode,
    pitches: voicing.pitches.map(projectPitch),
    bassPolicy: voicing.bassPolicy,
    generatedBy: {
      engineVersion: voicing.generatedBy.engineVersion,
      family: voicing.generatedBy.family,
    },
  };
}

function projectEvent(event: ChordEvent): CanonicalValue {
  return {
    id: event.id,
    duration: projectBeat(event.duration),
    annotation: event.annotation,
    chord: projectChord(event.chord),
    voicing: projectVoicing(event.voicing),
  };
}

function projectCompletion(
  completion: Measure["completion"],
): CanonicalValue {
  if (completion.kind === "empty" || completion.kind === "complete") {
    return { kind: completion.kind };
  }
  return {
    kind: completion.kind,
    expectedDuration: projectBeat(completion.expectedDuration),
    reason: completion.reason,
  };
}

function projectMeasure(measure: Measure): CanonicalValue {
  return {
    id: measure.id,
    events: measure.events.map(projectEvent),
    completion: projectCompletion(measure.completion),
  };
}

function projectSection(section: Section): CanonicalValue {
  return {
    id: section.id,
    name: section.name,
    annotation: section.annotation,
    keyOverride: projectKey(section.keyOverride),
    voiceLeadingBoundary: section.voiceLeadingBoundary,
    measures: section.measures.map(projectMeasure),
  };
}

function projectDocument(
  document: ProgressionDocumentV2,
): Readonly<{ [key: string]: CanonicalValue }> {
  const playback: { [key: string]: CanonicalValue } = {
    instrumentId: document.playback.instrumentId,
    masterVolume: document.playback.masterVolume,
    reverbAmount: document.playback.reverbAmount,
    countInBars: document.playback.countInBars,
  };
  /* jcpe-jnnu: the single optional persisted key — emitted exactly when the
   * validated document stores it; the default groove is only absence. */
  if (document.playback.grooveStyleId !== undefined) {
    playback["grooveStyleId"] = document.playback.grooveStyleId;
  }
  return {
    schema: document.schema,
    id: document.id,
    title: document.title,
    description: document.description,
    meter: {
      beatsPerBar: document.meter.beatsPerBar,
      beatUnit: document.meter.beatUnit,
    },
    tempoBpm: document.tempoBpm,
    key: projectKey(document.key),
    sections: document.sections.map(projectSection),
    playback,
  };
}

/** The exact canonical artifact text, including the single final LF. */
export function serializeCanonicalDocument(
  document: ProgressionDocumentV2,
): string {
  return `${writeValue(projectDocument(document), "")}\n`;
}

/* ------------------------------------------------------------------ */
/* Safe filename projection (contract section 4)                      */
/* ------------------------------------------------------------------ */

const FORBIDDEN_CODE_POINTS: ReadonlySet<number> = new Set(
  EXPORT_FILENAME_FORBIDDEN_CODE_POINTS,
);

function isForbiddenCodePoint(codePoint: number): boolean {
  if (FORBIDDEN_CODE_POINTS.has(codePoint)) return true;
  return EXPORT_FILENAME_FORBIDDEN_CODE_POINT_RANGES.some(
    (range) => codePoint >= range.first && codePoint <= range.last,
  );
}

function stripTrailingSpacesAndDots(input: string): string {
  let text = input;
  for (;;) {
    const trimmed = text.replace(/[ ]+$/u, "").replace(/\.+$/u, "");
    if (trimmed === text) return text;
    text = trimmed;
  }
}

export const sanitizeExportFilename = (
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

  if (title.trim() === "") {
    return Object.freeze({
      basename: fallback.replace(/\.(json|txt)$/iu, ""),
      filename: fallback,
      changed: true,
      usedFallback: true,
    });
  }

  /* Step 3: replace each MAXIMAL RUN of forbidden scalars (and lone
   * surrogate evidence) with one hyphen, iterating Unicode scalar values
   * without normalization. */
  let projected = "";
  let inForbiddenRun = false;
  for (const character of title) {
    const codePoint = character.codePointAt(0) ?? 0;
    const loneSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    if (loneSurrogate || isForbiddenCodePoint(codePoint)) {
      if (!inForbiddenRun) projected += "-";
      inForbiddenRun = true;
    } else {
      projected += character;
      inForbiddenRun = false;
    }
  }
  const replacedAnything = projected !== title;

  /* Step 4: remove one case-insensitive terminal owned extension. */
  const beforeExtensionStrip = projected;
  projected = projected.replace(
    /\.(changes\.json|changes\.txt|json|txt)$/iu,
    "",
  );
  const strippedExtension = projected !== beforeExtensionStrip;

  /* Step 5: trim edge spaces and trailing dots; collapse consecutive
   * REPLACEMENT hyphens only. Authored ordinary hyphens are untouched, so
   * the collapse targets runs introduced by step 3 — a run of replacement
   * hyphens can only arise from adjacent forbidden runs separated by
   * nothing, which step 3 already prevents; the belt-and-braces collapse
   * below therefore only ever merges a replacement hyphen with an adjacent
   * replacement hyphen produced across the extension strip seam. */
  projected = projected.replace(/^ +/u, "");
  projected = stripTrailingSpacesAndDots(projected);

  /* Step 6: truncate to 120 Unicode scalar values, then re-strip. */
  const scalars = Array.from(projected);
  if (scalars.length > 120) {
    projected = scalars.slice(0, 120).join("");
    projected = stripTrailingSpacesAndDots(projected);
  }

  /* Step 7: fallback when empty; reserved-device prefix otherwise. */
  if (projected === "") {
    return Object.freeze({
      basename: fallback.replace(/\.(json|txt)$/iu, ""),
      filename: fallback,
      changed: true,
      usedFallback: true,
    });
  }
  const firstComponent = projected.split(".")[0] ?? projected;
  const reserved = EXPORT_FILENAME_RESERVED_BASENAMES.some(
    (name) => name === firstComponent.toLowerCase(),
  );
  if (reserved) projected = `changes-${projected}`;

  const filename = `${projected}${extension}`;
  return Object.freeze({
    basename: projected,
    filename,
    changed:
      replacedAnything ||
      strippedExtension ||
      reserved ||
      projected !== title,
    usedFallback: false,
  });
};

/* ------------------------------------------------------------------ */
/* Coordinator (contract sections 3.2-3.4)                            */
/* ------------------------------------------------------------------ */

const HASH_PATTERN = new RegExp(SEMANTIC_DOCUMENT_HASH_PATTERN_SOURCE, "u");

function normalizeHashResult(raw: unknown): SemanticDocumentHash | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Readonly<{ [key: string]: unknown }>;
  const keys = Object.keys(record);
  if (record["ok"] !== true) return null;
  if (keys.length !== 2 || !keys.includes("digest")) return null;
  const digest = record["digest"];
  if (typeof digest !== "string" || !HASH_PATTERN.test(digest)) return null;
  return digest as SemanticDocumentHash;
}

export const prepareCanonicalJsonExport = async (
  request: PrepareCanonicalJsonExportRequest,
  dependencies: CanonicalJsonExportDependencies,
): Promise<CanonicalJsonExportResult> => {
  const source = request.document;
  const text = serializeCanonicalDocument(source);
  const bytes = new TextEncoder().encode(text);

  /* 3.2: the size law refuses before hashing or delivery. */
  if (bytes.length > MAX_CANONICAL_JSON_EXPORT_BYTES) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "export.canonical_bytes_exceeded" as const,
        path: EMPTY_REFUSAL_PATH,
        received: bytes.length,
        maximum: MAX_CANONICAL_JSON_EXPORT_BYTES,
      }),
    });
  }

  /* 3.3.1: one JSON.parse, no reviver. */
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "export.canonical_parse_failed" as const,
        path: EMPTY_REFUSAL_PATH,
      }),
    });
  }

  /* 3.3.2: one injected F2 structural decode. */
  const decoded = dependencies.decodeDocumentShape(parsed);
  if (!decoded.ok) {
    const first = decoded.errors[0];
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "export.canonical_structural_round_trip_failed" as const,
        path: first.path,
        issueCodes: Object.freeze(decoded.errors.map((issue) => issue.code)),
      }),
    });
  }

  /* 3.3.3: one injected F3 semantic validation. */
  const validated = dependencies.validateCanonicalRoundTrip(decoded.value);
  if (!validated.ok) {
    const first = validated.errors[0];
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "export.canonical_semantic_round_trip_failed" as const,
        path: first.path,
        issueCodes: Object.freeze(validated.errors.map((issue) => issue.code)),
      }),
    });
  }

  /* 3.3.4: one injected explicit semantic equality over every field. */
  if (!dependencies.semanticallyEqualDocuments(source, validated.value)) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "export.canonical_semantic_mismatch" as const,
        path: EMPTY_REFUSAL_PATH,
      }),
    });
  }

  /* 3.4: injected hash boundary normalized to the exact envelope; a throw,
   * rejection, malformed envelope, or malformed digest is
   * export.hash_unavailable and nothing raw survives. */
  let digest: SemanticDocumentHash | null;
  try {
    digest = normalizeHashResult(await dependencies.hashBytes(bytes));
  } catch {
    digest = null;
  }
  if (digest === null) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "export.hash_unavailable" as const,
        path: EMPTY_REFUSAL_PATH,
      }),
    });
  }

  const filename = dependencies.sanitizeExportFilename(
    source.title,
    "canonical-json",
  );

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schema: CANONICAL_JSON_ARTIFACT_SCHEMA,
      kind: "canonical-json" as const,
      mediaType: CANONICAL_JSON_MEDIA_TYPE,
      filename: filename.filename,
      text,
      byteLength: bytes.length,
      semanticDocumentHash: digest,
      sourceDocumentId: source.id,
    }),
  });
};
