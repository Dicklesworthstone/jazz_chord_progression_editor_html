import {
  PROGRESSION_DOCUMENT_SCHEMA,
  makeBeatDuration,
  makeChordEvent,
  makeMeter,
  makePlaybackSettings,
  makeSpelledPitch,
  pitchClassOf,
  type ChordEvent,
  type ChordSpec,
  type ChordSpecInput,
  type CustomChordSpecInput,
  type DomainPath,
  type MeasureShape,
  type ProgressionDocumentShapeV2,
  type SectionShape,
  type SpelledPitch,
  type SpelledPitchClass,
  type StableIdFor,
  type StableIdKind,
  type VoicingInput,
} from "../domain";
import {
  LEGACY_ALTERATION_FLAG_ENTRIES,
  LEGACY_AUTO_VOICING_DEFAULT,
  LEGACY_CHORD_FIELDS,
  LEGACY_DOCUMENT_DEFAULTS,
  LEGACY_DOCUMENT_FIELDS,
  LEGACY_MIGRATION_CANDIDATE_SCHEMA,
  LEGACY_MIGRATION_CONTRACT_SCHEMA,
  LEGACY_MIGRATION_POLICY_ID,
  LEGACY_MIGRATION_POLICY_VERSION,
  LEGACY_MIGRATION_REPORT_SCHEMA,
  LEGACY_REPORT_CODE_ORDER,
  LEGACY_SECTION_FIELDS,
  LEGACY_TYPE_SUFFIX_ENTRIES,
  LEGACY_UI_ONLY_FIELDS,
  LEGACY_VOICING_METADATA_FIELDS,
  MAX_LEGACY_CHORDS,
  MAX_LEGACY_CHORDS_PER_SECTION,
  MAX_LEGACY_JSON_DEPTH,
  MAX_LEGACY_LONG_TEXT_CODE_POINTS,
  MAX_LEGACY_REPORT_ITEMS,
  MAX_LEGACY_SECTIONS,
  MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
  MAX_LEGACY_SOURCE_PROPERTIES,
  MAX_LEGACY_UTF8_BYTES,
  MAX_TRUSTED_LEGACY_NOTES,
  MIN_TRUSTED_LEGACY_NOTES,
  type LegacyCanonicalizedCode,
  type LegacyCustomCode,
  type LegacyIgnoredCode,
  type LegacyIdentityMapping,
  type LegacyMigrationDependencies,
  type LegacyMigrationEvidence,
  type LegacyMigrationOperations,
  type LegacyMigrationRefusal,
  type LegacyMigrationRequest,
  type LegacyMigrationReport,
  type LegacyMigrationResult,
  type LegacyMigrationSummary,
  type LegacyPreservedCode,
  type LegacyRejectedCode,
  type LegacyReportCode,
  type LegacyReportGroup,
  type LegacyReportItem,
} from "./legacy-migration-contract";

type MutableWorkCounters = {
  bytesVisited: number;
  jsonCodeUnitsVisited: number;
  maximumJsonDepth: number;
  sourcePropertiesVisited: number;
  sectionsVisited: number;
  chordSlotsVisited: number;
  notesVisited: number;
  symbolParseCalls: number;
  resolutionCalls: number;
  idRequests: number;
  reportItemsEmitted: number;
};

type MigrationState = {
  readonly counters: MutableWorkCounters;
  readonly reportItems: LegacyReportItem[];
};

type SourceRecord = ReadonlyMap<string, unknown>;

type SnapshotChord = Readonly<{
  sourceIndex: number;
  sourcePath: DomainPath;
  record: SourceRecord | null;
}>;

type SnapshotSection = Readonly<{
  sourceIndex: number;
  sourcePath: DomainPath;
  record: SourceRecord | null;
  chords: readonly SnapshotChord[] | null;
  chordShape: "valid" | "missing" | "not-array" | "not-object";
}>;

type SnapshotSource = Readonly<{
  root: SourceRecord;
  sections: readonly SnapshotSection[];
}>;

type TrustedNotes = Readonly<{
  pitches: readonly SpelledPitch[];
  midis: readonly number[];
}>;

type PreparedEvent = Readonly<{
  sourcePath: DomainPath;
  targetMeasureIndex: number;
  annotation: string;
  chord: ChordSpecInput | CustomChordSpecInput;
  voicing: VoicingInput;
}>;

type PreparedSection = Readonly<{
  sourcePath: DomainPath;
  targetSectionIndex: number;
  name: string;
  annotation: string;
  events: readonly PreparedEvent[];
}>;

type Preparation = Readonly<{
  title: string;
  description: string;
  sections: readonly PreparedSection[];
  sourceSections: number;
  sourceChordSlots: number;
  rejectedSections: number;
  rejectedEvents: number;
}>;

type AllocatedId<K extends StableIdKind> = Readonly<{
  kind: K;
  value: StableIdFor<K>;
}>;

type AllocatedIds = {
  readonly seen: Map<string, Readonly<{ sourcePath: DomainPath }>>;
  readonly mappings: LegacyIdentityMapping[];
};

type ReportDescriptor =
  | Readonly<{ group: "preserved"; code: LegacyPreservedCode }>
  | Readonly<{ group: "canonicalized"; code: LegacyCanonicalizedCode }>
  | Readonly<{ group: "custom"; code: LegacyCustomCode }>
  | Readonly<{ group: "ignored"; code: LegacyIgnoredCode }>
  | Readonly<{ group: "rejected"; code: LegacyRejectedCode }>;

type LegacyMigrationWithEvidenceResult = Readonly<{
  result: LegacyMigrationResult;
  evidence: LegacyMigrationEvidence;
}>;

const unreadableProperty = Symbol("legacy-unreadable-own-property");
const legacyScientificPitchCapture =
  /^([A-G])(bb|##|b|#)?(0|-?[1-9][0-9]*)$/;
const legacyPitchClassPattern = /^[A-G](?:bb|##|b|#)?$/;

const documentFields = new Set<string>(LEGACY_DOCUMENT_FIELDS);
const sectionFields = new Set<string>(LEGACY_SECTION_FIELDS);
const chordFields = new Set<string>(LEGACY_CHORD_FIELDS);
const uiOnlyFields = new Set<string>(LEGACY_UI_ONLY_FIELDS);
const voicingMetadataFields = new Set<string>(
  LEGACY_VOICING_METADATA_FIELDS,
);
const typeSuffixes = new Map<string, string>(
  LEGACY_TYPE_SUFFIX_ENTRIES.map((entry) => [entry.type, entry.suffix]),
);
const reportCodeOrder = new Map<LegacyReportCode, number>(
  LEGACY_REPORT_CODE_ORDER.map((code, index) => [code, index]),
);

function requireValue<T>(
  result: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>,
  label: string,
): T {
  if (!result.ok) {
    throw new TypeError(`Invalid reviewed C0 constant: ${label}`);
  }
  return result.value;
}

const defaultMeter = requireValue(
  makeMeter(LEGACY_DOCUMENT_DEFAULTS.meter),
  "meter",
);
const defaultDuration = requireValue(
  makeBeatDuration(LEGACY_DOCUMENT_DEFAULTS.eventDuration),
  "eventDuration",
);
const defaultPlayback = requireValue(
  makePlaybackSettings(LEGACY_DOCUMENT_DEFAULTS.playback),
  "playback",
);

class MigrationAbort extends Error {
  constructor(readonly refusal: LegacyMigrationRefusal) {
    super("C0 migration aborted");
    this.name = "MigrationAbort";
  }
}

function path(...segments: readonly (string | number)[]): DomainPath {
  return Object.freeze([...segments]);
}

function appendPath(
  base: DomainPath,
  ...segments: readonly (string | number)[]
): DomainPath {
  return Object.freeze([...base, ...segments]);
}

function frozenRefusal(
  refusal: LegacyMigrationRefusal,
): LegacyMigrationRefusal {
  const frozenPath = Object.freeze([...refusal.path]);
  return Object.freeze({ ...refusal, path: frozenPath });
}

function abort(refusal: LegacyMigrationRefusal): never {
  throw new MigrationAbort(frozenRefusal(refusal));
}

function createCounters(): MutableWorkCounters {
  return {
    bytesVisited: 0,
    jsonCodeUnitsVisited: 0,
    maximumJsonDepth: 0,
    sourcePropertiesVisited: 0,
    sectionsVisited: 0,
    chordSlotsVisited: 0,
    notesVisited: 0,
    symbolParseCalls: 0,
    resolutionCalls: 0,
    idRequests: 0,
    reportItemsEmitted: 0,
  };
}

function freezeEvidence(
  state: MigrationState,
  termination: LegacyMigrationEvidence["termination"],
): LegacyMigrationEvidence {
  return Object.freeze({
    contractSchema: LEGACY_MIGRATION_CONTRACT_SCHEMA,
    policyId: LEGACY_MIGRATION_POLICY_ID,
    policyVersion: LEGACY_MIGRATION_POLICY_VERSION,
    termination,
    counters: Object.freeze({ ...state.counters }),
  });
}

function failureWithEvidence(
  state: MigrationState,
  refusal: LegacyMigrationRefusal,
): LegacyMigrationWithEvidenceResult {
  const result: LegacyMigrationResult = Object.freeze({
    ok: false,
    refusal: frozenRefusal(refusal),
  });
  return Object.freeze({
    result,
    evidence: freezeEvidence(state, "complete-refusal"),
  });
}

function emitReport(
  state: MigrationState,
  descriptor: ReportDescriptor,
  sourcePath: DomainPath,
  targetPath: DomainPath | null,
): void {
  if (state.reportItems.length >= MAX_LEGACY_REPORT_ITEMS) {
    abort({
      code: "limit.legacy_report_items_exceeded",
      path: sourcePath,
      received: MAX_LEGACY_REPORT_ITEMS + 1,
      maximum: MAX_LEGACY_REPORT_ITEMS,
    });
  }

  const frozenSourcePath = Object.freeze([...sourcePath]);
  const frozenTargetPath =
    targetPath === null ? null : Object.freeze([...targetPath]);
  let item: LegacyReportItem;
  switch (descriptor.group) {
    case "preserved":
      item = Object.freeze({
        group: descriptor.group,
        code: descriptor.code,
        sourcePath: frozenSourcePath,
        targetPath: frozenTargetPath,
      });
      break;
    case "canonicalized":
      item = Object.freeze({
        group: descriptor.group,
        code: descriptor.code,
        sourcePath: frozenSourcePath,
        targetPath: frozenTargetPath,
      });
      break;
    case "custom":
      item = Object.freeze({
        group: descriptor.group,
        code: descriptor.code,
        sourcePath: frozenSourcePath,
        targetPath: frozenTargetPath,
      });
      break;
    case "ignored":
      item = Object.freeze({
        group: descriptor.group,
        code: descriptor.code,
        sourcePath: frozenSourcePath,
        targetPath: frozenTargetPath,
      });
      break;
    case "rejected":
      item = Object.freeze({
        group: descriptor.group,
        code: descriptor.code,
        sourcePath: frozenSourcePath,
        targetPath: frozenTargetPath,
      });
      break;
  }
  state.reportItems.push(item);
  state.counters.reportItemsEmitted += 1;
}

function isRecordValue(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function snapshotRecord(
  value: object,
  basePath: DomainPath,
  state: MigrationState,
): SourceRecord {
  const snapshot = new Map<string, unknown>();
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || descriptor.enumerable !== true) continue;

    state.counters.sourcePropertiesVisited += 1;
    if (state.counters.sourcePropertiesVisited > MAX_LEGACY_SOURCE_PROPERTIES) {
      abort({
        code: "limit.legacy_source_properties_exceeded",
        path: appendPath(basePath, key),
        received: state.counters.sourcePropertiesVisited,
        maximum: MAX_LEGACY_SOURCE_PROPERTIES,
      });
    }

    snapshot.set(
      key,
      "value" in descriptor ? descriptor.value : unreadableProperty,
    );
  }
  return snapshot;
}

/**
 * Reads one array slot as inert data without consulting an inherited property
 * or invoking an accessor. This remains a private deep-import seam; the public
 * compatibility barrel intentionally does not re-export it.
 */
export function readLegacyArrayDataElement(
  value: readonly unknown[],
  index: number,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  return descriptor !== undefined &&
      descriptor.enumerable === true &&
      "value" in descriptor
    ? descriptor.value
    : unreadableProperty;
}

function preflightJsonDepth(
  sourceText: string,
  state: MigrationState,
): void {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < sourceText.length; index += 1) {
    const codeUnit = sourceText.charCodeAt(index);
    state.counters.jsonCodeUnitsVisited += 1;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (codeUnit === 0x5c) {
        escaped = true;
      } else if (codeUnit === 0x22) {
        inString = false;
      }
      continue;
    }

    if (codeUnit === 0x22) {
      inString = true;
      continue;
    }
    if (codeUnit === 0x7b || codeUnit === 0x5b) {
      depth += 1;
      state.counters.maximumJsonDepth = Math.max(
        state.counters.maximumJsonDepth,
        depth,
      );
      if (depth > MAX_LEGACY_JSON_DEPTH) {
        abort({
          code: "limit.legacy_json_depth_exceeded",
          path: path(),
          received: depth,
          maximum: MAX_LEGACY_JSON_DEPTH,
        });
      }
    } else if (codeUnit === 0x7d || codeUnit === 0x5d) {
      depth = Math.max(0, depth - 1);
    }
  }
}

function decodeSource(
  request: LegacyMigrationRequest,
  state: MigrationState,
): unknown {
  const receivedBytes = request.sourceBytes.byteLength;
  state.counters.bytesVisited = Math.min(
    receivedBytes,
    MAX_LEGACY_UTF8_BYTES + 1,
  );
  if (receivedBytes > MAX_LEGACY_UTF8_BYTES) {
    abort({
      code: "limit.legacy_utf8_bytes_exceeded",
      path: path(),
      received: receivedBytes,
      maximum: MAX_LEGACY_UTF8_BYTES,
    });
  }

  const ownedBytes = new Uint8Array(receivedBytes);
  ownedBytes.set(request.sourceBytes);

  let sourceText: string;
  try {
    sourceText = new TextDecoder("utf-8", { fatal: true }).decode(ownedBytes);
  } catch {
    abort({ code: "legacy.utf8_invalid", path: path() });
  }

  preflightJsonDepth(sourceText, state);
  try {
    const decoded: unknown = JSON.parse(sourceText);
    return decoded;
  } catch {
    abort({ code: "legacy.json_syntax_invalid", path: path() });
  }
}

function snapshotSource(
  decoded: unknown,
  state: MigrationState,
): SnapshotSource {
  if (!isRecordValue(decoded)) {
    abort({ code: "legacy.root_invalid", path: path() });
  }
  const root = snapshotRecord(decoded, path(), state);
  const sectionCandidate = root.get("sections");
  if (!root.has("sections") || !isUnknownArray(sectionCandidate)) {
    abort({ code: "legacy.sections_invalid", path: path("sections") });
  }
  const sectionValues = sectionCandidate;
  if (sectionValues.length > MAX_LEGACY_SECTIONS) {
    abort({
      code: "limit.legacy_sections_exceeded",
      path: path("sections", MAX_LEGACY_SECTIONS),
      received: sectionValues.length,
      maximum: MAX_LEGACY_SECTIONS,
    });
  }

  const sections: SnapshotSection[] = [];
  let chordSlots = 0;
  for (let sectionIndex = 0; sectionIndex < sectionValues.length; sectionIndex += 1) {
    state.counters.sectionsVisited += 1;
    const sectionPath = path("sections", sectionIndex);
    const value = readLegacyArrayDataElement(sectionValues, sectionIndex);
    if (!isRecordValue(value)) {
      sections.push(Object.freeze({
        sourceIndex: sectionIndex,
        sourcePath: sectionPath,
        record: null,
        chords: null,
        chordShape: "not-object",
      }));
      continue;
    }

    const record = snapshotRecord(value, sectionPath, state);
    if (!record.has("chords")) {
      sections.push(Object.freeze({
        sourceIndex: sectionIndex,
        sourcePath: sectionPath,
        record,
        chords: null,
        chordShape: "missing",
      }));
      continue;
    }
    const chordValues = record.get("chords");
    if (!isUnknownArray(chordValues)) {
      sections.push(Object.freeze({
        sourceIndex: sectionIndex,
        sourcePath: sectionPath,
        record,
        chords: null,
        chordShape: "not-array",
      }));
      continue;
    }
    if (chordValues.length > MAX_LEGACY_CHORDS_PER_SECTION) {
      abort({
        code: "limit.legacy_chords_per_section_exceeded",
        path: appendPath(sectionPath, "chords", MAX_LEGACY_CHORDS_PER_SECTION),
        received: chordValues.length,
        maximum: MAX_LEGACY_CHORDS_PER_SECTION,
      });
    }

    const chords: SnapshotChord[] = [];
    for (let chordIndex = 0; chordIndex < chordValues.length; chordIndex += 1) {
      if (chordSlots >= MAX_LEGACY_CHORDS) {
        abort({
          code: "limit.legacy_events_exceeded",
          path: appendPath(sectionPath, "chords", chordIndex),
          received: chordSlots + 1,
          maximum: MAX_LEGACY_CHORDS,
        });
      }
      chordSlots += 1;
      state.counters.chordSlotsVisited += 1;
      const chordPath = appendPath(sectionPath, "chords", chordIndex);
      const chordValue = readLegacyArrayDataElement(chordValues, chordIndex);
      chords.push(Object.freeze({
        sourceIndex: chordIndex,
        sourcePath: chordPath,
        record: isRecordValue(chordValue)
          ? snapshotRecord(chordValue, chordPath, state)
          : null,
      }));
    }
    sections.push(Object.freeze({
      sourceIndex: sectionIndex,
      sourcePath: sectionPath,
      record,
      chords: Object.freeze(chords),
      chordShape: "valid",
    }));
  }

  return Object.freeze({ root, sections: Object.freeze(sections) });
}

function emitKnownFieldDisposition(
  record: SourceRecord,
  knownFields: ReadonlySet<string>,
  basePath: DomainPath,
  state: MigrationState,
  kind: "document" | "section" | "chord",
): void {
  for (const key of record.keys()) {
    if (!knownFields.has(key)) {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.unknown_field" },
        appendPath(basePath, key),
        null,
      );
      continue;
    }
    if (kind === "section" && uiOnlyFields.has(key)) {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.ui_field" },
        appendPath(basePath, key),
        null,
      );
    } else if (kind === "chord" && voicingMetadataFields.has(key)) {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.voicing_metadata" },
        appendPath(basePath, key),
        null,
      );
    } else if (kind === "chord" && key === "tensions") {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.tensions" },
        appendPath(basePath, key),
        null,
      );
    }
  }
}

function textCodePointObservation(value: string): Readonly<{
  scalarValid: boolean;
  codePoints: number;
}> {
  let codePoints = 0;
  let scalarValid = true;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        index += 1;
      } else {
        scalarValid = false;
      }
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      scalarValid = false;
    }
    codePoints += 1;
  }
  return Object.freeze({ scalarValid, codePoints });
}

function readText(
  record: SourceRecord,
  key: string,
  basePath: DomainPath,
  limit: number,
  state: MigrationState,
): string | null {
  if (!record.has(key)) return null;
  const sourcePath = appendPath(basePath, key);
  const value = record.get(key);
  if (typeof value !== "string") {
    emitReport(
      state,
      { group: "ignored", code: "legacy.ignored.invalid_field_type" },
      sourcePath,
      null,
    );
    return null;
  }

  const observed = textCodePointObservation(value);
  if (!observed.scalarValid) {
    emitReport(
      state,
      { group: "rejected", code: "legacy.rejected.invalid_unicode_scalar" },
      sourcePath,
      null,
    );
    return null;
  }
  if (observed.codePoints > limit) {
    emitReport(
      state,
      { group: "rejected", code: "legacy.rejected.text_limit" },
      sourcePath,
      null,
    );
    return null;
  }
  return value;
}

function accidentalValue(token: string | undefined): -2 | -1 | 0 | 1 | 2 {
  switch (token) {
    case "bb": return -2;
    case "b": return -1;
    case "#": return 1;
    case "##": return 2;
    case undefined: return 0;
    default: return 0;
  }
}

function naturalSemitone(step: string): number {
  switch (step) {
    case "C": return 0;
    case "D": return 2;
    case "E": return 4;
    case "F": return 5;
    case "G": return 7;
    case "A": return 9;
    case "B": return 11;
    default: return 0;
  }
}

function readTrustedNotes(
  record: SourceRecord,
  basePath: DomainPath,
  state: MigrationState,
): TrustedNotes | null {
  if (!record.has("notes")) return null;
  const notesPath = appendPath(basePath, "notes");
  const value = record.get("notes");
  if (
    !Array.isArray(value) ||
    value.length < MIN_TRUSTED_LEGACY_NOTES ||
    value.length > MAX_TRUSTED_LEGACY_NOTES
  ) {
    emitReport(
      state,
      { group: "ignored", code: "legacy.ignored.invalid_notes" },
      notesPath,
      null,
    );
    return null;
  }

  const pitches: SpelledPitch[] = [];
  const midis: number[] = [];
  const seenMidis = new Set<number>();
  let trusted = true;
  for (const member of value) {
    state.counters.notesVisited += 1;
    // A MIDI-valid spelling is at most `Cbb-2` (five ASCII code units).
    // Reject longer digit runs before numeric conversion so hostile but
    // grammar-shaped octaves cannot force unbounded BigInt allocation.
    if (typeof member !== "string" || member.length > 5) {
      trusted = false;
      continue;
    }
    const match = legacyScientificPitchCapture.exec(member);
    if (match === null) {
      trusted = false;
      continue;
    }
    const step = match[1];
    const octaveText = match[3];
    if (step === undefined || octaveText === undefined) {
      trusted = false;
      continue;
    }
    const alter = accidentalValue(match[2]);
    const octave = Number(octaveText);
    const midi =
      12 * (octave + 1) + naturalSemitone(step) + alter;
    if (!Number.isSafeInteger(octave) || midi < 0 || midi > 127) {
      trusted = false;
      continue;
    }
    if (seenMidis.has(midi)) {
      trusted = false;
      continue;
    }
    seenMidis.add(midi);
    const pitchResult = makeSpelledPitch({
      step,
      alter,
      octave,
    });
    if (!pitchResult.ok) {
      trusted = false;
      continue;
    }
    pitches.push(pitchResult.value);
    midis.push(midi);
  }

  if (!trusted || pitches.length !== value.length) {
    emitReport(
      state,
      { group: "ignored", code: "legacy.ignored.invalid_notes" },
      notesPath,
      null,
    );
    return null;
  }
  return Object.freeze({
    pitches: Object.freeze(pitches),
    midis: Object.freeze(midis),
  });
}

function spellingKey(pitch: SpelledPitchClass): string {
  return `${pitch.step}:${String(pitch.alter)}`;
}

function exactPitchClassEqual(
  left: SpelledPitchClass,
  right: SpelledPitchClass,
): boolean {
  return left.step === right.step && left.alter === right.alter;
}

function classifyAgreement(
  chord: ChordSpec,
  notes: TrustedNotes,
  dependencies: LegacyMigrationDependencies,
  state: MigrationState,
): "exact" | "spelling" | "sounding" {
  state.counters.resolutionCalls += 1;
  const resolved = dependencies.resolveChord(chord);
  if (!resolved.ok) return "sounding";

  let comparisonPitches = notes.pitches;
  if (chord.bass !== null) {
    let minimumIndex = 0;
    for (let index = 1; index < notes.midis.length; index += 1) {
      const midi = notes.midis[index];
      const minimum = notes.midis[minimumIndex];
      if (midi !== undefined && minimum !== undefined && midi < minimum) {
        minimumIndex = index;
      }
    }
    const minimumPitch = notes.pitches[minimumIndex];
    if (
      minimumPitch === undefined ||
      !exactPitchClassEqual(minimumPitch, chord.bass)
    ) {
      return "sounding";
    }
    comparisonPitches = Object.freeze([
      ...notes.pitches.slice(0, minimumIndex),
      ...notes.pitches.slice(minimumIndex + 1),
    ]);
  }

  let soundingAgreement = false;
  for (const realization of resolved.value.realizations) {
    const exactSet = new Set(realization.spelledPitchNames.map(spellingKey));
    const soundingSet = new Set<number>(realization.pitchClasses);
    const exact = comparisonPitches.every((pitch) =>
      exactSet.has(spellingKey(pitch)),
    );
    if (exact) return "exact";
    if (
      comparisonPitches.every((pitch) =>
        soundingSet.has(pitchClassOf(pitch)),
      )
    ) {
      soundingAgreement = true;
    }
  }
  return soundingAgreement ? "spelling" : "sounding";
}

function stablePitchNames(
  notes: TrustedNotes,
): readonly [SpelledPitchClass, ...SpelledPitchClass[]] {
  const first = notes.pitches[0];
  if (first === undefined) {
    throw new TypeError("Trusted C0 notes must be nonempty");
  }
  const values: SpelledPitchClass[] = [];
  const seen = new Set<string>();
  for (const pitch of notes.pitches) {
    const key = spellingKey(pitch);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(Object.freeze({ step: pitch.step, alter: pitch.alter }));
  }
  const head = values[0];
  if (head === undefined) {
    throw new TypeError("Trusted C0 pitch-name projection must be nonempty");
  }
  return Object.freeze([head, ...values.slice(1)]);
}

function parseSymbol(
  sourceText: string,
  dependencies: LegacyMigrationDependencies,
  state: MigrationState,
): ChordSpec | null {
  state.counters.symbolParseCalls += 1;
  const parsed = dependencies.parseChordSymbol(sourceText, "ascii");
  return parsed.ok ? parsed.chord : null;
}

function autoVoicing(): VoicingInput {
  return LEGACY_AUTO_VOICING_DEFAULT;
}

function manualVoicing(notes: TrustedNotes): VoicingInput {
  return Object.freeze({
    mode: "manual",
    pitches: notes.pitches,
    bassPolicy: "included",
  });
}

function customChord(
  label: string,
  notes: TrustedNotes,
): CustomChordSpecInput {
  return Object.freeze({
    kind: "custom",
    sourceText: label,
    label,
    pitchNames: stablePitchNames(notes),
    bass: null,
  });
}

function inspectRootTypeBass(
  record: SourceRecord,
  sourcePath: DomainPath,
  state: MigrationState,
): Readonly<{
  root: string | null;
  suffix: string | null;
  labelType: string | null;
  bass: string | null;
}> {
  const rootText = readText(
    record,
    "root",
    sourcePath,
    MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
    state,
  );
  const typeText = readText(
    record,
    "type",
    sourcePath,
    MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
    state,
  );
  const bassText = readText(
    record,
    "bass",
    sourcePath,
    MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
    state,
  );

  let root: string | null = null;
  if (rootText !== null) {
    if (legacyPitchClassPattern.test(rootText)) {
      root = rootText;
    } else {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.invalid_root" },
        appendPath(sourcePath, "root"),
        null,
      );
    }
  }

  let suffix: string | null = null;
  let labelType: string | null = null;
  if (typeText !== null) {
    const mapped = typeSuffixes.get(typeText);
    if (mapped === undefined) {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.unknown_type" },
        appendPath(sourcePath, "type"),
        null,
      );
      if (typeText.length > 0) labelType = typeText;
    } else {
      suffix = mapped;
      labelType = mapped;
    }
  }

  let bass: string | null = null;
  if (bassText !== null && bassText.length > 0) {
    if (legacyPitchClassPattern.test(bassText)) {
      bass = bassText;
    } else {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.invalid_bass" },
        appendPath(sourcePath, "bass"),
        null,
      );
    }
  }
  return Object.freeze({ root, suffix, labelType, bass });
}

function boundedConstructedLabel(
  harmony: Readonly<{
    root: string | null;
    labelType: string | null;
    bass: string | null;
  }>,
  sourcePath: DomainPath,
  state: MigrationState,
): string | null {
  if (harmony.root === null || harmony.labelType === null) return null;
  const label = `${harmony.root}${harmony.labelType}${
    harmony.bass === null ? "" : `/${harmony.bass}`
  }`;
  if (
    textCodePointObservation(label).codePoints >
    MAX_LEGACY_SHORT_TEXT_CODE_POINTS
  ) {
    emitReport(
      state,
      { group: "rejected", code: "legacy.rejected.text_limit" },
      sourcePath,
      null,
    );
    return null;
  }
  return label;
}

function alterationModifiers(
  record: SourceRecord,
  sourcePath: DomainPath,
  namePresent: boolean,
  state: MigrationState,
): readonly string[] {
  const modifiers: string[] = [];
  for (const entry of LEGACY_ALTERATION_FLAG_ENTRIES) {
    if (!record.has(entry.field)) continue;
    const fieldPath = appendPath(sourcePath, entry.field);
    if (namePresent) {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.alteration_evidence" },
        fieldPath,
        null,
      );
    }
    const value = record.get(entry.field);
    if (typeof value !== "boolean") {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.invalid_field_type" },
        fieldPath,
        null,
      );
    } else if (!namePresent && value) {
      modifiers.push(entry.modifier);
    }
  }
  return Object.freeze(modifiers);
}

function prepareChord(
  record: SourceRecord,
  sourcePath: DomainPath,
  targetSectionIndex: number,
  targetMeasureIndex: number,
  dependencies: LegacyMigrationDependencies,
  state: MigrationState,
): PreparedEvent | null {
  emitKnownFieldDisposition(record, chordFields, sourcePath, state, "chord");

  const sectionTarget = path("sections", targetSectionIndex);
  const measureTarget = appendPath(
    sectionTarget,
    "measures",
    targetMeasureIndex,
  );
  const eventTarget = appendPath(measureTarget, "events", 0);
  const chordTarget = appendPath(eventTarget, "chord");
  const voicingTarget = appendPath(eventTarget, "voicing");

  const annotation = readText(
    record,
    "annotation",
    sourcePath,
    MAX_LEGACY_LONG_TEXT_CODE_POINTS,
    state,
  );
  const trustedNotes = readTrustedNotes(record, sourcePath, state);
  const namePresent = record.has("name");
  const name = readText(
    record,
    "name",
    sourcePath,
    MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
    state,
  );
  const harmony = inspectRootTypeBass(record, sourcePath, state);
  const modifiers = alterationModifiers(
    record,
    sourcePath,
    namePresent,
    state,
  );

  let parsedChord: ChordSpec | null = null;
  let parsedOrigin: "name" | "constructed" | null = null;
  if (name !== null) {
    parsedChord = parseSymbol(name, dependencies, state);
    if (parsedChord !== null) {
      parsedOrigin = "name";
      emitReport(
        state,
        { group: "preserved", code: "legacy.preserved.symbol" },
        appendPath(sourcePath, "name"),
        chordTarget,
      );
    } else {
      emitReport(
        state,
        { group: "ignored", code: "legacy.ignored.name_parse_failure" },
        appendPath(sourcePath, "name"),
        null,
      );
    }
  }

  let constructedText: string | null = null;
  if (harmony.root !== null && harmony.suffix !== null) {
    const modifierText =
      !namePresent && modifiers.length > 0
        ? `(${modifiers.join(",")})`
        : "";
    constructedText = `${harmony.root}${harmony.suffix}${modifierText}${
      harmony.bass === null ? "" : `/${harmony.bass}`
    }`;
  }
  if (parsedChord === null && constructedText !== null) {
    parsedChord = parseSymbol(constructedText, dependencies, state);
    if (parsedChord !== null) {
      parsedOrigin = "constructed";
      emitReport(
        state,
        {
          group: "canonicalized",
          code: "legacy.canonicalized.symbol_from_root_type",
        },
        sourcePath,
        chordTarget,
      );
    }
  }

  const fallbackLabel = boundedConstructedLabel(harmony, sourcePath, state);
  const customLabel =
    name !== null && name.length > 0
      ? name
      : constructedText ?? fallbackLabel;
  let preparedChord: ChordSpecInput | CustomChordSpecInput | null = null;
  let preparedVoicing: VoicingInput | null = null;

  if (parsedChord !== null) {
    if (trustedNotes === null) {
      preparedChord = parsedChord;
      preparedVoicing = autoVoicing();
      emitReport(
        state,
        {
          group: "canonicalized",
          code: "legacy.canonicalized.auto_voicing_default",
        },
        sourcePath,
        voicingTarget,
      );
    } else {
      const agreement = classifyAgreement(
        parsedChord,
        trustedNotes,
        dependencies,
        state,
      );
      if (agreement === "exact") {
        preparedChord = parsedChord;
      } else if (customLabel !== null && customLabel.length > 0) {
        preparedChord = customChord(customLabel, trustedNotes);
        const code: LegacyCustomCode =
          parsedOrigin === "constructed"
            ? "legacy.custom.constructed_notes_conflict"
            : agreement === "spelling"
              ? "legacy.custom.name_notes_spelling_conflict"
              : "legacy.custom.name_notes_sounding_conflict";
        emitReport(
          state,
          { group: "custom", code },
          sourcePath,
          chordTarget,
        );
      }
      if (preparedChord !== null) {
        preparedVoicing = manualVoicing(trustedNotes);
        emitReport(
          state,
          { group: "preserved", code: "legacy.preserved.manual_notes" },
          appendPath(sourcePath, "notes"),
          appendPath(voicingTarget, "pitches"),
        );
      }
    }
  } else if (
    trustedNotes !== null &&
    customLabel !== null &&
    customLabel.length > 0
  ) {
    preparedChord = customChord(customLabel, trustedNotes);
    preparedVoicing = manualVoicing(trustedNotes);
    emitReport(
      state,
      { group: "custom", code: "legacy.custom.notes_without_symbol" },
      sourcePath,
      chordTarget,
    );
    emitReport(
      state,
      { group: "preserved", code: "legacy.preserved.manual_notes" },
      appendPath(sourcePath, "notes"),
      appendPath(voicingTarget, "pitches"),
    );
  }

  if (preparedChord === null || preparedVoicing === null) {
    emitReport(
      state,
      { group: "rejected", code: "legacy.rejected.no_usable_symbol_or_notes" },
      sourcePath,
      null,
    );
    return null;
  }

  if (annotation !== null) {
    emitReport(
      state,
      { group: "preserved", code: "legacy.preserved.annotation" },
      appendPath(sourcePath, "annotation"),
      appendPath(eventTarget, "annotation"),
    );
  } else {
    emitReport(
      state,
      {
        group: "canonicalized",
        code: "legacy.canonicalized.event_annotation_default",
      },
      appendPath(sourcePath, "annotation"),
      appendPath(eventTarget, "annotation"),
    );
  }
  emitReport(
    state,
    {
      group: "canonicalized",
      code: "legacy.canonicalized.meter_duration_default",
    },
    sourcePath,
    measureTarget,
  );

  return Object.freeze({
    sourcePath,
    targetMeasureIndex,
    annotation: annotation ?? LEGACY_DOCUMENT_DEFAULTS.eventAnnotation,
    chord: preparedChord,
    voicing: preparedVoicing,
  });
}

function prepareCandidate(
  source: SnapshotSource,
  dependencies: LegacyMigrationDependencies,
  state: MigrationState,
): Preparation {
  emitKnownFieldDisposition(
    source.root,
    documentFields,
    path(),
    state,
    "document",
  );

  const sourceTitle = readText(
    source.root,
    "name",
    path(),
    MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
    state,
  );
  const title =
    sourceTitle !== null && sourceTitle.length > 0
      ? sourceTitle
      : LEGACY_DOCUMENT_DEFAULTS.title;
  if (sourceTitle !== null && sourceTitle.length > 0) {
    emitReport(
      state,
      { group: "preserved", code: "legacy.preserved.document_name" },
      path("name"),
      path("title"),
    );
  } else {
    emitReport(
      state,
      {
        group: "canonicalized",
        code: "legacy.canonicalized.document_title_default",
      },
      path("name"),
      path("title"),
    );
  }

  const sourceDescription = readText(
    source.root,
    "description",
    path(),
    MAX_LEGACY_LONG_TEXT_CODE_POINTS,
    state,
  );
  const description = sourceDescription ?? LEGACY_DOCUMENT_DEFAULTS.description;
  if (sourceDescription !== null) {
    emitReport(
      state,
      {
        group: "preserved",
        code: "legacy.preserved.document_description",
      },
      path("description"),
      path("description"),
    );
  } else {
    emitReport(
      state,
      {
        group: "canonicalized",
        code: "legacy.canonicalized.document_description_default",
      },
      path("description"),
      path("description"),
    );
  }
  emitReport(
    state,
    {
      group: "canonicalized",
      code: "legacy.canonicalized.playback_default",
    },
    path(),
    path("playback"),
  );

  const preparedSections: PreparedSection[] = [];
  let rejectedSections = 0;
  let rejectedEvents = 0;
  for (const sourceSection of source.sections) {
    if (sourceSection.record === null) {
      rejectedSections += 1;
      emitReport(
        state,
        { group: "rejected", code: "legacy.rejected.section_not_object" },
        sourceSection.sourcePath,
        null,
      );
      continue;
    }
    emitKnownFieldDisposition(
      sourceSection.record,
      sectionFields,
      sourceSection.sourcePath,
      state,
      "section",
    );
    if (sourceSection.chordShape === "missing") {
      rejectedSections += 1;
      emitReport(
        state,
        { group: "rejected", code: "legacy.rejected.section_chords_missing" },
        appendPath(sourceSection.sourcePath, "chords"),
        null,
      );
      continue;
    }
    if (sourceSection.chordShape === "not-array") {
      rejectedSections += 1;
      emitReport(
        state,
        {
          group: "rejected",
          code: "legacy.rejected.section_chords_not_array",
        },
        appendPath(sourceSection.sourcePath, "chords"),
        null,
      );
      continue;
    }
    if (sourceSection.chords === null) {
      throw new TypeError("Valid C0 section snapshot must contain chords");
    }

    const targetSectionIndex = preparedSections.length;
    const targetSection = path("sections", targetSectionIndex);
    const sourceName = readText(
      sourceSection.record,
      "name",
      sourceSection.sourcePath,
      MAX_LEGACY_SHORT_TEXT_CODE_POINTS,
      state,
    );
    const name =
      sourceName !== null && sourceName.length > 0
        ? sourceName
        : `${LEGACY_DOCUMENT_DEFAULTS.sectionNamePrefix}${String(sourceSection.sourceIndex + 1)}`;
    if (sourceName !== null && sourceName.length > 0) {
      emitReport(
        state,
        { group: "preserved", code: "legacy.preserved.section_name" },
        appendPath(sourceSection.sourcePath, "name"),
        appendPath(targetSection, "name"),
      );
    } else {
      emitReport(
        state,
        {
          group: "canonicalized",
          code: "legacy.canonicalized.section_name_default",
        },
        appendPath(sourceSection.sourcePath, "name"),
        appendPath(targetSection, "name"),
      );
    }

    const sourceAnnotation = readText(
      sourceSection.record,
      "annotation",
      sourceSection.sourcePath,
      MAX_LEGACY_LONG_TEXT_CODE_POINTS,
      state,
    );
    const sectionAnnotation =
      sourceAnnotation ?? LEGACY_DOCUMENT_DEFAULTS.sectionAnnotation;
    if (sourceAnnotation !== null) {
      emitReport(
        state,
        { group: "preserved", code: "legacy.preserved.annotation" },
        appendPath(sourceSection.sourcePath, "annotation"),
        appendPath(targetSection, "annotation"),
      );
    } else {
      emitReport(
        state,
        {
          group: "canonicalized",
          code: "legacy.canonicalized.section_annotation_default",
        },
        appendPath(sourceSection.sourcePath, "annotation"),
        appendPath(targetSection, "annotation"),
      );
    }
    emitReport(
      state,
      {
        group: "canonicalized",
        code: "legacy.canonicalized.section_policy_default",
      },
      sourceSection.sourcePath,
      targetSection,
    );

    const events: PreparedEvent[] = [];
    for (const sourceChord of sourceSection.chords) {
      if (sourceChord.record === null) {
        rejectedEvents += 1;
        emitReport(
          state,
          { group: "rejected", code: "legacy.rejected.event_not_object" },
          sourceChord.sourcePath,
          null,
        );
        continue;
      }
      const prepared = prepareChord(
        sourceChord.record,
        sourceChord.sourcePath,
        targetSectionIndex,
        events.length,
        dependencies,
        state,
      );
      if (prepared === null) {
        rejectedEvents += 1;
      } else {
        events.push(prepared);
      }
    }
    preparedSections.push(Object.freeze({
      sourcePath: sourceSection.sourcePath,
      targetSectionIndex,
      name,
      annotation: sectionAnnotation,
      events: Object.freeze(events),
    }));
  }

  return Object.freeze({
    title,
    description,
    sections: Object.freeze(preparedSections),
    sourceSections: source.sections.length,
    sourceChordSlots: state.counters.chordSlotsVisited,
    rejectedSections,
    rejectedEvents,
  });
}

function allocateId<K extends StableIdKind>(
  kind: K,
  sourcePath: DomainPath,
  targetPath: DomainPath,
  dependencies: LegacyMigrationDependencies,
  allocated: AllocatedIds,
  state: MigrationState,
): AllocatedId<K> {
  state.counters.idRequests += 1;
  const result = dependencies.idFactory.next(kind);
  if (!result.ok) {
    abort({
      code: "legacy.id_factory_failed",
      path: sourcePath,
      kind,
      factoryCode: result.refusal.code,
    });
  }
  const wire = String(result.value);
  const first = allocated.seen.get(wire);
  if (first !== undefined) {
    abort({
      code: "legacy.id_collision",
      path: sourcePath,
      kind,
      collidingId: wire,
      firstSourcePath: first.sourcePath,
    });
  }
  allocated.seen.set(wire, Object.freeze({ sourcePath }));
  allocated.mappings.push(Object.freeze({
    sourcePath: Object.freeze([...sourcePath]),
    targetPath: Object.freeze([...targetPath]),
    kind,
    id: result.value,
  }));
  return Object.freeze({ kind, value: result.value });
}

function buildEvent(
  prepared: PreparedEvent,
  id: StableIdFor<"event">,
): ChordEvent {
  const result = makeChordEvent({
    id,
    duration: defaultDuration,
    annotation: prepared.annotation,
    chord: prepared.chord,
    voicing: prepared.voicing,
  });
  if (!result.ok) {
    throw new TypeError(`Invalid internally prepared C0 event: ${result.refusal.code}`);
  }
  return result.value;
}

function buildDocument(
  preparation: Preparation,
  dependencies: LegacyMigrationDependencies,
  state: MigrationState,
): Readonly<{
  document: ProgressionDocumentShapeV2;
  identityMappings: readonly LegacyIdentityMapping[];
}> {
  const allocated: AllocatedIds = {
    seen: new Map(),
    mappings: [],
  };
  const documentId = allocateId(
    "document",
    path(),
    path("id"),
    dependencies,
    allocated,
    state,
  ).value;

  const sections: SectionShape[] = [];
  for (const preparedSection of preparation.sections) {
    const sectionTarget = path(
      "sections",
      preparedSection.targetSectionIndex,
    );
    const sectionId = allocateId(
      "section",
      preparedSection.sourcePath,
      appendPath(sectionTarget, "id"),
      dependencies,
      allocated,
      state,
    ).value;
    const measures: MeasureShape[] = [];
    for (const preparedEvent of preparedSection.events) {
      const measureTarget = appendPath(
        sectionTarget,
        "measures",
        preparedEvent.targetMeasureIndex,
      );
      const measureId = allocateId(
        "measure",
        preparedEvent.sourcePath,
        appendPath(measureTarget, "id"),
        dependencies,
        allocated,
        state,
      ).value;
      const eventId = allocateId(
        "event",
        preparedEvent.sourcePath,
        appendPath(measureTarget, "events", 0, "id"),
        dependencies,
        allocated,
        state,
      ).value;
      const event = buildEvent(preparedEvent, eventId);
      measures.push(Object.freeze({
        id: measureId,
        events: Object.freeze([event]),
        completion: Object.freeze({ kind: "complete" }),
      }));
    }
    sections.push(Object.freeze({
      id: sectionId,
      name: preparedSection.name,
      annotation: preparedSection.annotation,
      keyOverride: LEGACY_DOCUMENT_DEFAULTS.sectionKeyOverride,
      voiceLeadingBoundary:
        LEGACY_DOCUMENT_DEFAULTS.sectionVoiceLeadingBoundary,
      measures: Object.freeze(measures),
    }));
  }

  const document: ProgressionDocumentShapeV2 = Object.freeze({
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: documentId,
    title: preparation.title,
    description: preparation.description,
    meter: defaultMeter,
    tempoBpm: LEGACY_DOCUMENT_DEFAULTS.tempoBpm,
    key: LEGACY_DOCUMENT_DEFAULTS.key,
    sections: Object.freeze(sections),
    playback: defaultPlayback,
  });
  return Object.freeze({
    document,
    identityMappings: Object.freeze(allocated.mappings),
  });
}

function compareUnicodeScalars(left: string, right: string): number {
  const leftScalars = Array.from(left, (scalar) => scalar.codePointAt(0) ?? 0);
  const rightScalars = Array.from(right, (scalar) => scalar.codePointAt(0) ?? 0);
  const shared = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < shared; index += 1) {
    const leftScalar = leftScalars[index];
    const rightScalar = rightScalars[index];
    if (leftScalar === undefined || rightScalar === undefined) continue;
    if (leftScalar < rightScalar) return -1;
    if (leftScalar > rightScalar) return 1;
  }
  if (leftScalars.length < rightScalars.length) return -1;
  if (leftScalars.length > rightScalars.length) return 1;
  return 0;
}

function comparePaths(left: DomainPath, right: DomainPath): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (leftSegment === undefined || rightSegment === undefined) continue;
    if (leftSegment === rightSegment) continue;
    if (typeof leftSegment === "string") {
      if (typeof rightSegment === "number") return -1;
      return compareUnicodeScalars(leftSegment, rightSegment);
    }
    if (typeof rightSegment === "string") return 1;
    return leftSegment < rightSegment ? -1 : 1;
  }
  if (left.length < right.length) return -1;
  if (left.length > right.length) return 1;
  return 0;
}

function compareReportItems(
  left: LegacyReportItem,
  right: LegacyReportItem,
): number {
  const source = comparePaths(left.sourcePath, right.sourcePath);
  if (source !== 0) return source;
  const leftCode = reportCodeOrder.get(left.code) ?? Number.MAX_SAFE_INTEGER;
  const rightCode = reportCodeOrder.get(right.code) ?? Number.MAX_SAFE_INTEGER;
  if (leftCode !== rightCode) return leftCode - rightCode;
  if (left.targetPath === null) return right.targetPath === null ? 0 : -1;
  if (right.targetPath === null) return 1;
  return comparePaths(left.targetPath, right.targetPath);
}

function groupItems<G extends LegacyReportGroup>(
  items: readonly LegacyReportItem[],
  group: G,
): readonly Extract<LegacyReportItem, Readonly<{ group: G }>>[] {
  return Object.freeze(
    items
      .filter(
        (item): item is Extract<LegacyReportItem, Readonly<{ group: G }>> =>
          item.group === group,
      )
      .sort(compareReportItems),
  );
}

function reportSummary(
  preparation: Preparation,
  groups: Readonly<{
    preserved: readonly LegacyReportItem[];
    canonicalized: readonly LegacyReportItem[];
    custom: readonly LegacyReportItem[];
    ignored: readonly LegacyReportItem[];
    rejected: readonly LegacyReportItem[];
  }>,
): LegacyMigrationSummary {
  let migratedEvents = 0;
  let parsedEvents = 0;
  let customEvents = 0;
  let manualEvents = 0;
  let autoEvents = 0;
  for (const section of preparation.sections) {
    migratedEvents += section.events.length;
    for (const event of section.events) {
      if (event.chord.kind === "parsed") parsedEvents += 1;
      else customEvents += 1;
      if (event.voicing.mode === "auto") autoEvents += 1;
      else if (event.voicing.mode === "manual") manualEvents += 1;
    }
  }
  return Object.freeze({
    sourceSections: preparation.sourceSections,
    sourceChordSlots: preparation.sourceChordSlots,
    migratedSections: preparation.sections.length,
    migratedEvents,
    rejectedSections: preparation.rejectedSections,
    rejectedEvents: preparation.rejectedEvents,
    parsedEvents,
    customEvents,
    manualEvents,
    autoEvents,
    preservedItems: groups.preserved.length,
    canonicalizedItems: groups.canonicalized.length,
    customItems: groups.custom.length,
    ignoredItems: groups.ignored.length,
    rejectedItems: groups.rejected.length,
  });
}

function migrateLegacyJsonCore(
  request: LegacyMigrationRequest,
  dependencies: LegacyMigrationDependencies,
): LegacyMigrationWithEvidenceResult {
  const state: MigrationState = {
    counters: createCounters(),
    reportItems: [],
  };
  try {
    const decoded = decodeSource(request, state);
    const source = snapshotSource(decoded, state);
    const preparation = prepareCandidate(source, dependencies, state);
    const built = buildDocument(preparation, dependencies, state);

    const groups = Object.freeze({
      preserved: groupItems(state.reportItems, "preserved"),
      canonicalized: groupItems(state.reportItems, "canonicalized"),
      custom: groupItems(state.reportItems, "custom"),
      ignored: groupItems(state.reportItems, "ignored"),
      rejected: groupItems(state.reportItems, "rejected"),
    });
    const report: LegacyMigrationReport = Object.freeze({
      schema: LEGACY_MIGRATION_REPORT_SCHEMA,
      policyId: LEGACY_MIGRATION_POLICY_ID,
      policyVersion: LEGACY_MIGRATION_POLICY_VERSION,
      sourceKind: "unversioned-legacy-json",
      sourceBytes: state.counters.bytesVisited,
      summary: reportSummary(preparation, groups),
      groups,
      identityMappings: built.identityMappings,
    });
    const result: LegacyMigrationResult = Object.freeze({
      ok: true,
      value: Object.freeze({
        schema: LEGACY_MIGRATION_CANDIDATE_SCHEMA,
        document: built.document,
        report,
      }),
    });
    return Object.freeze({
      result,
      evidence: freezeEvidence(state, "complete-candidate"),
    });
  } catch (error) {
    if (error instanceof MigrationAbort) {
      return failureWithEvidence(state, error.refusal);
    }
    throw error;
  }
}

/** Package-private evidence seam over the exact public migration core. */
export function migrateLegacyJsonWithEvidence(
  request: LegacyMigrationRequest,
  dependencies: LegacyMigrationDependencies,
): LegacyMigrationWithEvidenceResult {
  return migrateLegacyJsonCore(request, dependencies);
}

export function migrateLegacyJson(
  request: LegacyMigrationRequest,
  dependencies: LegacyMigrationDependencies,
): LegacyMigrationResult {
  return migrateLegacyJsonCore(request, dependencies).result;
}

export const legacyMigrationOperations: LegacyMigrationOperations =
  Object.freeze({ migrateLegacyJson });
