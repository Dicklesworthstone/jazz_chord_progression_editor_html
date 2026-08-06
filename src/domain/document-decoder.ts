import {
  makeAutoVoiceCount,
  makeChordDegree,
  type AutoBassPolicy,
  type AutoVoicing,
  type AutoVoicingFamily,
  type ChordDegree,
  type ChordEvent,
  type ChordSpec,
  type CustomChordSpec,
  type DegreeNumber,
  type FrozenVoicing,
  type ManualVoicing,
  type StoredBassPolicy,
  type Voicing,
} from "./chord";
import {
  DEFAULT_GROOVE_STYLE_ID,
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_JSON_NESTING_DEPTH,
  MAX_SECTION_MEASURES,
  MAX_UTF8_IMPORT_BYTES,
  PROGRESSION_DOCUMENT_SCHEMA,
  type GrooveStyleId,
  type MeasureCompletionShape,
  type MeasureShape,
  type PlaybackSettings,
  type ProgressionDocumentShapeV2,
  type SectionShape,
} from "./document";
import {
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  MIDI_PPQ,
  makeBeatDuration,
  makeMeter,
  makeTempoBpm,
  normalizeBeatValue,
  type BeatDuration,
  type BeatValue,
  type Meter,
} from "./duration";
import {
  type DocumentDecodeOperations,
  type DocumentDecoderEvidence,
  type DocumentDecoderIssue,
  type DocumentImportByteIssueCode,
  type DocumentImportBytePreflightResult,
  type DocumentImportBytePreflightWithEvidenceResult,
  type DocumentShapeDecodeResult,
  type DocumentShapeDecodeWithEvidenceResult,
  type DocumentShapeIssueCode,
} from "./document-decoder-contract";
import {
  parseStableId,
  type ChordEventId,
  type StableIdKind,
  type StableIdFor,
} from "./ids";
import { makeInstrumentId, type InstrumentId } from "./instrument-id";
import { makeKeyMode, type KeyContext, type KeyMode } from "./key";
import {
  makeMidiPitch,
  makeSpelledPitch,
  makeSpelledPitchClass,
  pitchClassOf,
  soundingSemitoneOf,
  type Alteration,
  type MidiPitch,
  type SpelledPitch,
  type SpelledPitchClass,
  type Step,
} from "./pitch";
import type { DomainPath } from "./result";
import { compareValidationIssues } from "./validated-document";

type MutableEvidence = {
  -readonly [K in keyof DocumentDecoderEvidence]: number;
};

type MutableDecodeState = {
  readonly evidence: MutableEvidence;
  readonly issues: DocumentDecoderIssue<DocumentShapeIssueCode>[];
  readonly idPaths: Map<string, DomainPath[]>;
  timelineTicks: bigint;
};

type DataDescriptorSnapshot = Readonly<{
  kind: "data";
  enumerable: boolean;
  value: unknown;
}>;

type AccessorDescriptorSnapshot = Readonly<{
  kind: "accessor";
  enumerable: boolean;
}>;

type DescriptorSnapshot =
  | DataDescriptorSnapshot
  | AccessorDescriptorSnapshot;

type ContainerSnapshot = {
  readonly kind: "array" | "record";
  readonly recordEligible: boolean;
  readonly path: DomainPath;
  readonly length: number;
  readonly stringKeys: readonly string[];
  readonly symbolKeys: readonly symbol[];
  readonly descriptors: ReadonlyMap<PropertyKey, DescriptorSnapshot>;
  readonly children: Map<PropertyKey, ContainerSnapshot>;
};

type SnapshotAttempt =
  | Readonly<{ ok: true; snapshot: ContainerSnapshot }>
  | Readonly<{ ok: false; path: DomainPath }>;

type DepthFrame =
  | Readonly<{
      kind: "enter";
      value: object;
      path: DomainPath;
      depth: number;
      parent: ContainerSnapshot | null;
      parentKey: PropertyKey | null;
    }>
  | Readonly<{ kind: "exit"; value: object }>;

type DepthPreflightResult =
  | Readonly<{ ok: true; root: ContainerSnapshot }>
  | Readonly<{
      ok: false;
      code: "shape.invalid_type" | "limit.json_depth_exceeded";
      path: DomainPath;
    }>;

type CollectionPreflightResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      code:
        | "limit.sections_exceeded"
        | "limit.measures_per_section_exceeded"
        | "limit.events_per_document_exceeded"
        | "limit.voicing_notes_exceeded";
      path: DomainPath;
    }>;

type FieldObservation =
  | Readonly<{
      ok: true;
      value: unknown;
      child: ContainerSnapshot | null;
    }>
  | Readonly<{ ok: false }>;

type DecodeValue<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>;

type TextPolicy = Readonly<{
  limit: number;
  limitCode:
    | "limit.symbol_code_points_exceeded"
    | "limit.annotation_code_points_exceeded"
    | "limit.title_code_points_exceeded"
    | "limit.section_name_code_points_exceeded"
    | "limit.custom_label_code_points_exceeded"
    | "limit.description_code_points_exceeded"
    | "limit.reason_code_points_exceeded"
    | "limit.engine_version_code_points_exceeded";
  blankCode: "string.blank" | "voicing.engine_version_invalid" | null;
}>;

type DecodedChord = ChordSpec | CustomChordSpec;

type DecodedAutoVoicing = Readonly<{
  mode: "auto";
  family: AutoVoicingFamily;
  voiceCount: AutoVoicing["voiceCount"];
  range: AutoVoicing["range"];
  bassPolicy: AutoBassPolicy;
}>;

type DecodedManualVoicing = Readonly<{
  mode: "manual";
  pitches: readonly [SpelledPitch, ...SpelledPitch[]];
  bassPolicy: StoredBassPolicy;
}>;

type DecodedFrozenVoicing = Readonly<{
  mode: "frozen";
  pitches: readonly [SpelledPitch, ...SpelledPitch[]];
  bassPolicy: StoredBassPolicy;
  generatedBy: FrozenVoicing["generatedBy"];
}>;

type DecodedVoicing =
  | DecodedAutoVoicing
  | DecodedManualVoicing
  | DecodedFrozenVoicing;

function createEvidence(): MutableEvidence {
  return {
    bytesObserved: 0,
    maxDepthObserved: 0,
    recordsInspected: 0,
    arraysInspected: 0,
    scalarFieldsInspected: 0,
    descriptorReads: 0,
    arraySlotsRead: 0,
    collectionLengthsObserved: 0,
    sectionSlotsObserved: 0,
    maxMeasuresPerSectionObserved: 0,
    eventSlotsObserved: 0,
    maxPitchArraySlotsObserved: 0,
    sectionElementsSemanticallyDecoded: 0,
    measureElementsSemanticallyDecoded: 0,
    eventValuesSemanticallyDecoded: 0,
    pitchElementsSemanticallyDecoded: 0,
    sectionElementsCopied: 0,
    measureElementsCopied: 0,
    eventValuesCopied: 0,
    pitchElementsCopied: 0,
    candidateObjectsAllocated: 0,
    candidateArraysAllocated: 0,
    diagnosticCandidatesProduced: 0,
    idOccurrences: 0,
    idClusters: 0,
    idDuplicateWorkUnits: 0,
    timelineAdditions: 0,
    timelineTicksObserved: 0,
  };
}

function freezeEvidence(evidence: MutableEvidence): DocumentDecoderEvidence {
  return Object.freeze(evidence);
}

function pathWith(path: DomainPath, segment: string | number): DomainPath {
  const next: (string | number)[] = [];
  for (const existing of path) next.push(existing);
  next.push(segment);
  return next;
}

function issueMessage(code: DocumentShapeIssueCode): string {
  return `A persisted schema field violates the ${code} structural rule.`;
}

function makeIssue<C extends DocumentShapeIssueCode>(
  code: C,
  path: DomainPath,
): DocumentDecoderIssue<C> {
  const frozenPath = Object.freeze(Array.from(path));
  return Object.freeze({ code, message: issueMessage(code), path: frozenPath });
}

function makeImportIssue<C extends DocumentImportByteIssueCode>(
  code: C,
): DocumentDecoderIssue<C> {
  const path: DomainPath = Object.freeze([]);
  return Object.freeze({
    code,
    message: code === "shape.invalid_type"
      ? "The utf8ByteLength field must be a canonical nonnegative safe integer."
      : "The utf8ByteLength field exceeds the 2 MiB import byte limit.",
    path,
  });
}

function appendIssue(
  state: MutableDecodeState,
  code: DocumentShapeIssueCode,
  path: DomainPath,
): void {
  state.evidence.diagnosticCandidatesProduced += 1;
  state.issues.push(makeIssue(code, path));
}

function samePath(left: DomainPath, right: DomainPath): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}

function finalizeIssues(
  issues: readonly DocumentDecoderIssue<DocumentShapeIssueCode>[],
): readonly [
  DocumentDecoderIssue<DocumentShapeIssueCode>,
  ...DocumentDecoderIssue<DocumentShapeIssueCode>[],
] {
  const sorted = Array.from(issues);
  sorted.sort(compareValidationIssues);
  const collapsed: DocumentDecoderIssue<DocumentShapeIssueCode>[] = [];
  for (const current of sorted) {
    const previous = collapsed[collapsed.length - 1];
    if (
      previous !== undefined &&
      previous.code === current.code &&
      samePath(previous.path, current.path)
    ) {
      continue;
    }
    collapsed.push(current);
  }
  const first = collapsed[0];
  if (first === undefined) {
    return Object.freeze([makeIssue("shape.invalid_type", [])]);
  }
  const tail = collapsed.slice(1);
  const nonempty = [first, ...tail] as const;
  return Object.freeze(nonempty);
}

function failureResult(
  issues: readonly DocumentDecoderIssue<DocumentShapeIssueCode>[],
): DocumentShapeDecodeResult {
  return Object.freeze({ ok: false, errors: finalizeIssues(issues) });
}

function singleFailureResult(
  code: DocumentShapeIssueCode,
  path: DomainPath,
  evidence: MutableEvidence,
): DocumentShapeDecodeResult {
  evidence.diagnosticCandidatesProduced += 1;
  return failureResult([makeIssue(code, path)]);
}

function successResult(
  value: ProgressionDocumentShapeV2,
): DocumentShapeDecodeResult {
  const warnings: readonly [] = Object.freeze([]);
  return Object.freeze({ ok: true, value, warnings });
}

function isObjectValue(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function hasBoxedBooleanBrand(value: object): boolean {
  try {
    Boolean.prototype.valueOf.call(value);
    return true;
  } catch {
    return false;
  }
}

function hasBoxedNumberBrand(value: object): boolean {
  try {
    Number.prototype.valueOf.call(value);
    return true;
  } catch {
    return false;
  }
}

function hasBoxedStringBrand(value: object): boolean {
  try {
    String.prototype.valueOf.call(value);
    return true;
  } catch {
    return false;
  }
}

function hasBoxedBigIntBrand(value: object): boolean {
  try {
    BigInt.prototype.valueOf.call(value);
    return true;
  } catch {
    return false;
  }
}

function hasBoxedSymbolBrand(value: object): boolean {
  try {
    Symbol.prototype.valueOf.call(value);
    return true;
  } catch {
    return false;
  }
}

function isBoxedPrimitive(value: object): boolean {
  return (
    hasBoxedBooleanBrand(value) ||
    hasBoxedNumberBrand(value) ||
    hasBoxedStringBrand(value) ||
    hasBoxedBigIntBrand(value) ||
    hasBoxedSymbolBrand(value)
  );
}

function canonicalArrayIndex(key: string): number | null {
  if (key.length === 0) return null;
  const number = Number(key);
  if (!Number.isInteger(number) || number < 0 || number >= 4_294_967_295) {
    return null;
  }
  if (String(number) !== key) return null;
  return number;
}

/** The sole routine that reflects over an untrusted container occurrence. */
function snapshotContainer(
  value: object,
  path: DomainPath,
  evidence: MutableEvidence,
): SnapshotAttempt {
  let array: boolean;
  try {
    array = Array.isArray(value);
  } catch {
    return { ok: false, path };
  }

  if (array) evidence.arraysInspected += 1;
  else evidence.recordsInspected += 1;

  let ownKeys: readonly (string | symbol)[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return { ok: false, path };
  }

  const descriptors = new Map<PropertyKey, DescriptorSnapshot>();
  const stringKeys: string[] = [];
  const symbolKeys: symbol[] = [];
  let length = 0;

  for (const key of ownKeys) {
    evidence.descriptorReads += 1;
    if (array && typeof key === "string" && canonicalArrayIndex(key) !== null) {
      evidence.arraySlotsRead += 1;
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return { ok: false, path };
    }
    if (descriptor === undefined) {
      return { ok: false, path };
    }
    if (typeof key === "string") stringKeys.push(key);
    else symbolKeys.push(key);

    if ("value" in descriptor) {
      const descriptorValue: unknown = descriptor.value;
      descriptors.set(
        key,
        Object.freeze({
          kind: "data",
          enumerable: descriptor.enumerable === true,
          value: descriptorValue,
        }),
      );
      if (array && key === "length" && typeof descriptorValue === "number") {
        length = descriptorValue;
      }
    } else {
      descriptors.set(
        key,
        Object.freeze({
          kind: "accessor",
          enumerable: descriptor.enumerable === true,
        }),
      );
    }
  }

  stringKeys.sort();
  const snapshot: ContainerSnapshot = {
    kind: array ? "array" : "record",
    recordEligible: !array && !isBoxedPrimitive(value),
    path,
    length,
    stringKeys,
    symbolKeys,
    descriptors,
    children: new Map<PropertyKey, ContainerSnapshot>(),
  };
  return { ok: true, snapshot };
}

function traversalKeys(snapshot: ContainerSnapshot): readonly string[] {
  if (snapshot.kind === "record") return snapshot.stringKeys;
  const indices: string[] = [];
  const extras: string[] = [];
  for (const key of snapshot.stringKeys) {
    if (key === "length") continue;
    if (canonicalArrayIndex(key) === null) extras.push(key);
    else indices.push(key);
  }
  indices.sort((left, right) => {
    const leftIndex = canonicalArrayIndex(left);
    const rightIndex = canonicalArrayIndex(right);
    if (leftIndex === null || rightIndex === null) return left < right ? -1 : 1;
    return leftIndex - rightIndex;
  });
  extras.sort();
  return indices.concat(extras);
}

function snapshotChildPath(
  snapshot: ContainerSnapshot,
  key: string,
): DomainPath {
  if (snapshot.kind === "array") {
    const index = canonicalArrayIndex(key);
    return pathWith(snapshot.path, index === null ? key : index);
  }
  return pathWith(snapshot.path, key);
}

function depthPreflight(
  input: object,
  evidence: MutableEvidence,
): DepthPreflightResult {
  const worklist: DepthFrame[] = [
    {
      kind: "enter",
      value: input,
      path: [],
      depth: 1,
      parent: null,
      parentKey: null,
    },
  ];
  const ancestors = new Set<object>();
  let root: ContainerSnapshot | null = null;

  while (worklist.length > 0) {
    const frame = worklist.pop();
    if (frame === undefined) continue;
    if (frame.kind === "exit") {
      ancestors.delete(frame.value);
      continue;
    }
    if (ancestors.has(frame.value)) {
      return { ok: false, code: "shape.invalid_type", path: frame.path };
    }
    if (frame.depth > evidence.maxDepthObserved) {
      evidence.maxDepthObserved = frame.depth;
    }
    if (frame.depth > MAX_JSON_NESTING_DEPTH) {
      return { ok: false, code: "limit.json_depth_exceeded", path: [] };
    }

    const attempt = snapshotContainer(frame.value, frame.path, evidence);
    if (!attempt.ok) {
      return { ok: false, code: "shape.invalid_type", path: attempt.path };
    }
    const snapshot = attempt.snapshot;
    if (frame.parent === null) root = snapshot;
    else if (frame.parentKey !== null) {
      frame.parent.children.set(frame.parentKey, snapshot);
    }

    ancestors.add(frame.value);
    worklist.push({ kind: "exit", value: frame.value });
    const keys = traversalKeys(snapshot);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const descriptor = snapshot.descriptors.get(key);
      if (descriptor?.kind !== "data" || !isObjectValue(descriptor.value)) {
        continue;
      }
      worklist.push({
        kind: "enter",
        value: descriptor.value,
        path: snapshotChildPath(snapshot, key),
        depth: frame.depth + 1,
        parent: snapshot,
        parentKey: key,
      });
    }
  }

  if (root === null) {
    return { ok: false, code: "shape.invalid_type", path: [] };
  }
  return { ok: true, root };
}

function passiveDataField(
  snapshot: ContainerSnapshot,
  key: string,
): Readonly<{ value: unknown; child: ContainerSnapshot | null }> | null {
  const descriptor = snapshot.descriptors.get(key);
  if (descriptor?.kind !== "data" || !descriptor.enumerable) return null;
  return {
    value: descriptor.value,
    child: snapshot.children.get(key) ?? null,
  };
}

function passiveArrayElement(
  snapshot: ContainerSnapshot,
  index: number,
): Readonly<{ value: unknown; child: ContainerSnapshot | null }> | null {
  const key = String(index);
  const descriptor = snapshot.descriptors.get(key);
  if (descriptor?.kind !== "data" || !descriptor.enumerable) return null;
  return {
    value: descriptor.value,
    child: snapshot.children.get(key) ?? null,
  };
}

function recognizedArrayField(
  snapshot: ContainerSnapshot,
  key: string,
): ContainerSnapshot | null {
  const field = passiveDataField(snapshot, key);
  if (field === null || field.child?.kind !== "array") return null;
  return field.child;
}

function recognizedRecordField(
  snapshot: ContainerSnapshot,
  key: string,
): ContainerSnapshot | null {
  const field = passiveDataField(snapshot, key);
  if (
    field === null ||
    field.child?.kind !== "record" ||
    !field.child.recordEligible
  ) {
    return null;
  }
  return field.child;
}

function recognizedDiscriminator(
  snapshot: ContainerSnapshot,
  key: string,
): string | null {
  const field = passiveDataField(snapshot, key);
  return field !== null && typeof field.value === "string" ? field.value : null;
}

function collectionFailure(
  code:
    | "limit.sections_exceeded"
    | "limit.measures_per_section_exceeded"
    | "limit.events_per_document_exceeded"
    | "limit.voicing_notes_exceeded",
  path: DomainPath,
): CollectionPreflightResult {
  return { ok: false, code, path };
}

function collectionPreflight(
  root: ContainerSnapshot,
  evidence: MutableEvidence,
): CollectionPreflightResult {
  const sections = recognizedArrayField(root, "sections");
  if (sections === null) return { ok: true };
  evidence.collectionLengthsObserved += 1;
  evidence.sectionSlotsObserved = Math.min(sections.length, 65);
  if (sections.length > MAX_DOCUMENT_SECTIONS) {
    return collectionFailure("limit.sections_exceeded", ["sections"]);
  }

  const measureArrays: ContainerSnapshot[] = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const sectionElement = passiveArrayElement(sections, sectionIndex);
    const section = sectionElement?.child;
    if (section?.kind !== "record" || !section.recordEligible) continue;
    const measures = recognizedArrayField(section, "measures");
    if (measures === null) continue;
    evidence.collectionLengthsObserved += 1;
    const observedMeasures = Math.min(measures.length, 1_025);
    if (observedMeasures > evidence.maxMeasuresPerSectionObserved) {
      evidence.maxMeasuresPerSectionObserved = observedMeasures;
    }
    if (measures.length > MAX_SECTION_MEASURES) {
      return collectionFailure(
        "limit.measures_per_section_exceeded",
        ["sections", sectionIndex, "measures"],
      );
    }
    measureArrays.push(measures);
  }

  const eventArrays: ContainerSnapshot[] = [];
  for (const measures of measureArrays) {
    for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
      const measureElement = passiveArrayElement(measures, measureIndex);
      const measure = measureElement?.child;
      if (measure?.kind !== "record" || !measure.recordEligible) continue;
      const events = recognizedArrayField(measure, "events");
      if (events === null) continue;
      evidence.collectionLengthsObserved += 1;
      const remaining = MAX_DOCUMENT_CHORD_EVENTS + 1 - evidence.eventSlotsObserved;
      evidence.eventSlotsObserved += Math.min(events.length, Math.max(remaining, 0));
      if (evidence.eventSlotsObserved >= MAX_DOCUMENT_CHORD_EVENTS + 1) {
        return collectionFailure("limit.events_per_document_exceeded", ["sections"]);
      }
      eventArrays.push(events);
    }
  }

  for (const events of eventArrays) {
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const eventElement = passiveArrayElement(events, eventIndex);
      const event = eventElement?.child;
      if (event?.kind !== "record" || !event.recordEligible) continue;

      const chord = recognizedRecordField(event, "chord");
      if (chord !== null && recognizedDiscriminator(chord, "kind") === "custom") {
        const pitchNames = recognizedArrayField(chord, "pitchNames");
        if (pitchNames !== null) {
          evidence.collectionLengthsObserved += 1;
          const observed = Math.min(pitchNames.length, 17);
          if (observed > evidence.maxPitchArraySlotsObserved) {
            evidence.maxPitchArraySlotsObserved = observed;
          }
          if (pitchNames.length > 16) {
            return collectionFailure(
              "limit.voicing_notes_exceeded",
              pathWith(chord.path, "pitchNames"),
            );
          }
        }
      }

      const voicing = recognizedRecordField(event, "voicing");
      if (voicing === null) continue;
      const mode = recognizedDiscriminator(voicing, "mode");
      if (mode !== "manual" && mode !== "frozen") continue;
      const pitches = recognizedArrayField(voicing, "pitches");
      if (pitches === null) continue;
      evidence.collectionLengthsObserved += 1;
      const observed = Math.min(pitches.length, 17);
      if (observed > evidence.maxPitchArraySlotsObserved) {
        evidence.maxPitchArraySlotsObserved = observed;
      }
      if (pitches.length > 16) {
        return collectionFailure(
          "limit.voicing_notes_exceeded",
          pathWith(voicing.path, "pitches"),
        );
      }
    }
  }
  return { ok: true };
}

function allocateCandidateObject<T extends object>(
  state: MutableDecodeState,
  value: T,
): Readonly<T> {
  state.evidence.candidateObjectsAllocated += 1;
  return Object.freeze(value);
}

function allocateCandidateArray<T>(
  state: MutableDecodeState,
  values: T[],
): readonly T[] {
  state.evidence.candidateArraysAllocated += 1;
  return Object.freeze(values);
}

function stringIsAllowed(key: string, allowed: readonly string[]): boolean {
  for (const candidate of allowed) {
    if (key === candidate) return true;
  }
  return false;
}

function auditRecord(
  snapshot: ContainerSnapshot,
  allowed: readonly string[],
  state: MutableDecodeState,
): boolean {
  const issueCount = state.issues.length;
  for (const symbol of snapshot.symbolKeys) {
    void symbol;
    appendIssue(state, "shape.invalid_type", snapshot.path);
  }
  for (const key of snapshot.stringKeys) {
    if (!stringIsAllowed(key, allowed)) {
      appendIssue(state, "shape.unknown_field", pathWith(snapshot.path, key));
    }
  }
  return state.issues.length === issueCount;
}

function requiredField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
  missingSchema: boolean,
): FieldObservation {
  const descriptor = snapshot.descriptors.get(key);
  if (descriptor === undefined) {
    appendIssue(
      state,
      missingSchema ? "document.schema_missing" : "shape.invalid_type",
      pathWith(snapshot.path, key),
    );
    return { ok: false };
  }
  if (descriptor.kind !== "data" || !descriptor.enumerable) {
    appendIssue(state, "shape.invalid_type", pathWith(snapshot.path, key));
    return { ok: false };
  }
  return {
    ok: true,
    value: descriptor.value,
    child: snapshot.children.get(key) ?? null,
  };
}

function requiredScalarField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
): FieldObservation {
  const field = requiredField(snapshot, key, state, false);
  if (field.ok) state.evidence.scalarFieldsInspected += 1;
  return field;
}

function requiredRecordField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
): DecodeValue<ContainerSnapshot> {
  const field = requiredField(snapshot, key, state, false);
  if (
    !field.ok ||
    field.child?.kind !== "record" ||
    !field.child.recordEligible
  ) {
    if (field.ok) appendIssue(state, "shape.invalid_type", pathWith(snapshot.path, key));
    return { ok: false };
  }
  return { ok: true, value: field.child };
}

function requiredArrayField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
): DecodeValue<ContainerSnapshot> {
  const field = requiredField(snapshot, key, state, false);
  if (!field.ok || field.child?.kind !== "array") {
    if (field.ok) appendIssue(state, "shape.invalid_type", pathWith(snapshot.path, key));
    return { ok: false };
  }
  return { ok: true, value: field.child };
}

function auditArray(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): boolean {
  const issueCount = state.issues.length;
  for (const symbol of snapshot.symbolKeys) {
    void symbol;
    appendIssue(state, "shape.invalid_type", snapshot.path);
  }

  for (const key of snapshot.stringKeys) {
    if (key === "length") continue;
    const index = canonicalArrayIndex(key);
    if (index === null || index >= snapshot.length) {
      appendIssue(state, "shape.unknown_field", pathWith(snapshot.path, key));
      continue;
    }
    const descriptor = snapshot.descriptors.get(key);
    if (descriptor?.kind !== "data" || !descriptor.enumerable) {
      appendIssue(state, "shape.invalid_type", pathWith(snapshot.path, index));
    }
  }

  for (let index = 0; index < snapshot.length; index += 1) {
    if (!snapshot.descriptors.has(String(index))) {
      appendIssue(state, "shape.invalid_type", pathWith(snapshot.path, index));
    }
  }
  return state.issues.length === issueCount;
}

function decodeArrayElements<T>(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
  decodeElement: (
    element: FieldObservation,
    index: number,
    path: DomainPath,
  ) => DecodeValue<T>,
): DecodeValue<T[]> {
  const issueCount = state.issues.length;
  auditArray(snapshot, state);
  const values: T[] = [];
  let allElementsValid = true;
  for (let index = 0; index < snapshot.length; index += 1) {
    const descriptor = snapshot.descriptors.get(String(index));
    if (descriptor?.kind !== "data" || !descriptor.enumerable) {
      allElementsValid = false;
      continue;
    }
    const element: FieldObservation = {
      ok: true,
      value: descriptor.value,
      child: snapshot.children.get(String(index)) ?? null,
    };
    const decoded = decodeElement(element, index, pathWith(snapshot.path, index));
    if (!decoded.ok) allElementsValid = false;
    else values.push(decoded.value);
  }
  if (!allElementsValid || state.issues.length !== issueCount) return { ok: false };
  return { ok: true, value: values };
}

function decodeArray<T>(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
  decodeElement: (
    element: FieldObservation,
    index: number,
    path: DomainPath,
  ) => DecodeValue<T>,
): DecodeValue<readonly T[]> {
  const elements = decodeArrayElements(snapshot, state, decodeElement);
  if (!elements.ok) return elements;
  return {
    ok: true,
    value: allocateCandidateArray(state, elements.value),
  };
}

function decodeStringObservation(
  field: FieldObservation,
  path: DomainPath,
  state: MutableDecodeState,
): DecodeValue<string> {
  if (!field.ok) return { ok: false };
  if (typeof field.value !== "string") {
    appendIssue(state, "shape.invalid_type", path);
    return { ok: false };
  }
  return { ok: true, value: field.value };
}

function inspectText(value: string): Readonly<{
  codePoints: number;
  validUnicodeScalars: boolean;
}> {
  let codePoints = 0;
  let validUnicodeScalars = true;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    codePoints += 1;
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (second >= 0xdc00 && second <= 0xdfff) index += 1;
      else validUnicodeScalars = false;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      validUnicodeScalars = false;
    }
  }
  return { codePoints, validUnicodeScalars };
}

function decodeTextField(
  snapshot: ContainerSnapshot,
  key: string,
  policy: TextPolicy,
  state: MutableDecodeState,
): DecodeValue<string> {
  const path = pathWith(snapshot.path, key);
  const field = requiredScalarField(snapshot, key, state);
  const string = decodeStringObservation(field, path, state);
  if (!string.ok) return string;
  const issueCount = state.issues.length;
  const inspected = inspectText(string.value);
  if (inspected.codePoints > policy.limit) {
    appendIssue(state, policy.limitCode, path);
  }
  if (!inspected.validUnicodeScalars) {
    appendIssue(state, "string.invalid_unicode_scalar", path);
  }
  if (
    policy.blankCode !== null &&
    String.prototype.trim.call(string.value).length === 0
  ) {
    appendIssue(state, policy.blankCode, path);
  }
  return state.issues.length === issueCount
    ? { ok: true, value: string.value }
    : { ok: false };
}

function decodeExactString(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
  accepted: (value: string) => boolean,
  refusalCode: DocumentShapeIssueCode,
): DecodeValue<string> {
  const path = pathWith(snapshot.path, key);
  const field = requiredScalarField(snapshot, key, state);
  const string = decodeStringObservation(field, path, state);
  if (!string.ok) return string;
  if (!accepted(string.value)) {
    appendIssue(state, refusalCode, path);
    return { ok: false };
  }
  return string;
}

function decodeNumberObservation(
  field: FieldObservation,
  path: DomainPath,
  state: MutableDecodeState,
): DecodeValue<number> {
  if (!field.ok) return { ok: false };
  if (typeof field.value !== "number") {
    appendIssue(state, "shape.invalid_type", path);
    return { ok: false };
  }
  return { ok: true, value: field.value };
}

function decodeNumberField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
): DecodeValue<number> {
  return decodeNumberObservation(
    requiredScalarField(snapshot, key, state),
    pathWith(snapshot.path, key),
    state,
  );
}

function decodeStableId<K extends StableIdKind>(
  snapshot: ContainerSnapshot,
  key: string,
  kind: K,
  state: MutableDecodeState,
): DecodeValue<StableIdFor<K>> {
  const path = pathWith(snapshot.path, key);
  const field = requiredScalarField(snapshot, key, state);
  const string = decodeStringObservation(field, path, state);
  if (!string.ok) return { ok: false };
  const parsed = parseStableId(kind, string.value);
  if (!parsed.ok) {
    appendIssue(state, parsed.refusal.code, path);
    return { ok: false };
  }
  state.evidence.idOccurrences += 1;
  state.evidence.idDuplicateWorkUnits += 1;
  const paths = state.idPaths.get(string.value);
  if (paths === undefined) state.idPaths.set(string.value, [Array.from(path)]);
  else paths.push(Array.from(path));
  return { ok: true, value: parsed.value };
}

function appendDuplicateIdIssues(state: MutableDecodeState): void {
  for (const paths of state.idPaths.values()) {
    if (paths.length < 2) continue;
    state.evidence.idClusters += 1;
    for (const path of paths) {
      state.evidence.idDuplicateWorkUnits += 1;
      appendIssue(state, "id.duplicate", path);
    }
  }
}

function decodeSpelledPitchClass(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<SpelledPitchClass> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["step", "alter"], state);
  const stepField = requiredScalarField(snapshot, "step", state);
  const stepString = decodeStringObservation(
    stepField,
    pathWith(snapshot.path, "step"),
    state,
  );
  const alter = decodeNumberField(snapshot, "alter", state);
  let stepValue: Step | null = null;
  let alterValue: Alteration | null = null;
  if (stepString.ok) {
    const checked = makeSpelledPitchClass({ step: stepString.value, alter: 0 });
    if (!checked.ok) appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "step"));
    else stepValue = checked.value.step;
  }
  if (alter.ok) {
    const checked = makeSpelledPitchClass({ step: "C", alter: alter.value });
    if (!checked.ok) appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "alter"));
    else alterValue = checked.value.alter;
  }
  if (
    stepValue === null ||
    alterValue === null ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: SpelledPitchClass = allocateCandidateObject(state, {
    step: stepValue,
    alter: alterValue,
  });
  return { ok: true, value: candidate };
}

function decodeNullablePitchClassField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
): DecodeValue<SpelledPitchClass | null> {
  const path = pathWith(snapshot.path, key);
  const field = requiredField(snapshot, key, state, false);
  if (!field.ok) return { ok: false };
  if (field.value === null) {
    state.evidence.scalarFieldsInspected += 1;
    return { ok: true, value: null };
  }
  if (field.child?.kind !== "record" || !field.child.recordEligible) {
    appendIssue(state, "shape.invalid_type", path);
    return { ok: false };
  }
  return decodeSpelledPitchClass(field.child, state);
}

function decodeSpelledPitch(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<SpelledPitch> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["step", "alter", "octave"], state);
  const stepField = requiredScalarField(snapshot, "step", state);
  const stepString = decodeStringObservation(
    stepField,
    pathWith(snapshot.path, "step"),
    state,
  );
  const alter = decodeNumberField(snapshot, "alter", state);
  const octave = decodeNumberField(snapshot, "octave", state);
  let stepValue: Step | null = null;
  let alterValue: Alteration | null = null;
  let octaveValue: number | null = null;
  if (stepString.ok) {
    const checked = makeSpelledPitchClass({ step: stepString.value, alter: 0 });
    if (!checked.ok) appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "step"));
    else stepValue = checked.value.step;
  }
  if (alter.ok) {
    const checked = makeSpelledPitchClass({ step: "C", alter: alter.value });
    if (!checked.ok) appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "alter"));
    else alterValue = checked.value.alter;
  }
  if (octave.ok) {
    const checked = makeSpelledPitch({ step: "C", alter: 0, octave: octave.value });
    if (!checked.ok) {
      appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "octave"));
    } else octaveValue = checked.value.octave;
  }
  if (
    stepValue === null ||
    alterValue === null ||
    octaveValue === null ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: SpelledPitch = allocateCandidateObject(state, {
    step: stepValue,
    alter: alterValue,
    octave: octaveValue,
  });
  return { ok: true, value: candidate };
}

function decodeKeyContext(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<KeyContext> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["tonic", "mode"], state);
  const tonicRecord = requiredRecordField(snapshot, "tonic", state);
  const tonic = tonicRecord.ok
    ? decodeSpelledPitchClass(tonicRecord.value, state)
    : { ok: false as const };
  const modeField = requiredScalarField(snapshot, "mode", state);
  const modeString = decodeStringObservation(
    modeField,
    pathWith(snapshot.path, "mode"),
    state,
  );
  let mode: KeyMode | null = null;
  if (modeString.ok) {
    const checked = makeKeyMode(modeString.value);
    if (!checked.ok) appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "mode"));
    else mode = checked.value;
  }
  if (!tonic.ok || mode === null || state.issues.length !== issueCount) {
    return { ok: false };
  }
  const candidate: KeyContext = allocateCandidateObject(state, {
    tonic: tonic.value,
    mode,
  });
  return { ok: true, value: candidate };
}

function decodeNullableKeyField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
): DecodeValue<KeyContext | null> {
  const path = pathWith(snapshot.path, key);
  const field = requiredField(snapshot, key, state, false);
  if (!field.ok) return { ok: false };
  if (field.value === null) {
    state.evidence.scalarFieldsInspected += 1;
    return { ok: true, value: null };
  }
  if (field.child?.kind !== "record" || !field.child.recordEligible) {
    appendIssue(state, "shape.invalid_type", path);
    return { ok: false };
  }
  return decodeKeyContext(field.child, state);
}

function decodeMeter(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<Meter> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["beatsPerBar", "beatUnit"], state);
  const beats = decodeNumberField(snapshot, "beatsPerBar", state);
  const unit = decodeNumberField(snapshot, "beatUnit", state);
  let beatsValue: Meter["beatsPerBar"] | null = null;
  let unitValue: Meter["beatUnit"] | null = null;
  if (beats.ok) {
    const checked = makeMeter({ beatsPerBar: beats.value, beatUnit: 4 });
    if (!checked.ok) appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "beatsPerBar"));
    else beatsValue = checked.value.beatsPerBar;
  }
  if (unit.ok) {
    const checked = makeMeter({ beatsPerBar: 4, beatUnit: unit.value });
    if (!checked.ok) appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "beatUnit"));
    else unitValue = checked.value.beatUnit;
  }
  if (
    beatsValue === null ||
    unitValue === null ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: Meter = allocateCandidateObject(state, {
    beatsPerBar: beatsValue,
    beatUnit: unitValue,
  });
  return { ok: true, value: candidate };
}

function decodeBeat(
  snapshot: ContainerSnapshot,
  duration: true,
  state: MutableDecodeState,
): DecodeValue<BeatDuration>;
function decodeBeat(
  snapshot: ContainerSnapshot,
  duration: false,
  state: MutableDecodeState,
): DecodeValue<BeatValue>;
function decodeBeat(
  snapshot: ContainerSnapshot,
  duration: boolean,
  state: MutableDecodeState,
): DecodeValue<BeatValue | BeatDuration> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["numerator", "denominator"], state);
  const numerator = decodeNumberField(snapshot, "numerator", state);
  const denominator = decodeNumberField(snapshot, "denominator", state);
  if (!numerator.ok || !denominator.ok) return { ok: false };
  const normalized = normalizeBeatValue({
    numerator: numerator.value,
    denominator: denominator.value,
  });
  if (!normalized.ok) {
    const suffix = normalized.refusal.path[0];
    appendIssue(
      state,
      normalized.refusal.code,
      suffix === undefined ? snapshot.path : pathWith(snapshot.path, suffix),
    );
    return { ok: false };
  }
  if (
    !Object.is(normalized.value.numerator, numerator.value) ||
    !Object.is(normalized.value.denominator, denominator.value)
  ) {
    appendIssue(state, "beat.not_normalized", snapshot.path);
  }
  if (duration && normalized.value.numerator === 0) {
    appendIssue(state, "beat.duration_not_positive", pathWith(snapshot.path, "numerator"));
  }
  if (state.issues.length !== issueCount) return { ok: false };
  if (duration) {
    const checked = makeBeatDuration({
      numerator: numerator.value,
      denominator: denominator.value,
    });
    if (!checked.ok) return { ok: false };
    const candidate: BeatDuration = allocateCandidateObject(state, {
      ...checked.value,
    });
    return { ok: true, value: candidate };
  }
  const candidate: BeatValue = allocateCandidateObject(state, {
    ...normalized.value,
  });
  return { ok: true, value: candidate };
}

function decodeChordDegree(
  snapshot: ContainerSnapshot,
  sixthOnly: true,
  state: MutableDecodeState,
): DecodeValue<ChordDegree<6>>;
function decodeChordDegree(
  snapshot: ContainerSnapshot,
  sixthOnly: false,
  state: MutableDecodeState,
): DecodeValue<ChordDegree>;
function decodeChordDegree(
  snapshot: ContainerSnapshot,
  sixthOnly: boolean,
  state: MutableDecodeState,
): DecodeValue<ChordDegree | ChordDegree<6>> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["number", "alter"], state);
  const number = decodeNumberField(snapshot, "number", state);
  const alter = decodeNumberField(snapshot, "alter", state);
  if (!number.ok || !alter.ok) return { ok: false };
  if (sixthOnly && number.value !== 6) {
    appendIssue(state, "shape.invalid_type", pathWith(snapshot.path, "number"));
  }
  let numberValue: DegreeNumber | null = null;
  let alterValue: ChordDegree["alter"] | null = null;
  if (!sixthOnly) {
    const checkedNumber = makeChordDegree({ number: number.value, alter: 0 });
    if (!checkedNumber.ok) {
      appendIssue(state, checkedNumber.refusal.code, pathWith(snapshot.path, "number"));
    } else numberValue = checkedNumber.value.number;
  }
  const checkedAlter = makeChordDegree({ number: 1, alter: alter.value });
  if (!checkedAlter.ok) {
    appendIssue(state, checkedAlter.refusal.code, pathWith(snapshot.path, "alter"));
  } else alterValue = checkedAlter.value.alter;
  if (state.issues.length !== issueCount) return { ok: false };
  if (sixthOnly) {
    if (alterValue === null) return { ok: false };
    const candidate: ChordDegree<6> = allocateCandidateObject(state, {
      number: 6,
      alter: alterValue,
    });
    return { ok: true, value: candidate };
  }
  if (numberValue === null || alterValue === null) return { ok: false };
  const candidate: ChordDegree = allocateCandidateObject(state, {
    number: numberValue,
    alter: alterValue,
  });
  return { ok: true, value: candidate };
}

function decodeDegreeArray(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<readonly ChordDegree[]> {
  const decoded = decodeArrayElements(snapshot, state, (element, _index, path) => {
    state.evidence.scalarFieldsInspected += 0;
    if (!element.ok || element.child?.kind !== "record" || !element.child.recordEligible) {
      appendIssue(state, "shape.invalid_type", path);
      return { ok: false };
    }
    return decodeChordDegree(element.child, false, state);
  });
  if (!decoded.ok) return decoded;
  for (let index = 1; index < decoded.value.length; index += 1) {
    const previous = decoded.value[index - 1];
    const current = decoded.value[index];
    if (previous === undefined || current === undefined) continue;
    if (previous.number === current.number && previous.alter === current.alter) {
      appendIssue(state, "chord.degree_duplicate", pathWith(snapshot.path, index));
      return { ok: false };
    }
    if (
      previous.number > current.number ||
      (previous.number === current.number && previous.alter > current.alter)
    ) {
      appendIssue(state, "chord.degree_order", snapshot.path);
      return { ok: false };
    }
  }
  return {
    ok: true,
    value: allocateCandidateArray(state, decoded.value),
  };
}

function decodeOmissionArray(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<readonly DegreeNumber[]> {
  const decoded = decodeArrayElements(snapshot, state, (element, _index, path) => {
    state.evidence.scalarFieldsInspected += 1;
    const number = decodeNumberObservation(element, path, state);
    if (!number.ok) return { ok: false };
    const checked = makeChordDegree({ number: number.value, alter: 0 });
    if (!checked.ok) {
      appendIssue(state, checked.refusal.code, path);
      return { ok: false };
    }
    return { ok: true, value: checked.value.number };
  });
  if (!decoded.ok) return decoded;
  for (let index = 1; index < decoded.value.length; index += 1) {
    const previous = decoded.value[index - 1];
    const current = decoded.value[index];
    if (previous === undefined || current === undefined) continue;
    if (previous === current) {
      appendIssue(state, "chord.degree_duplicate", pathWith(snapshot.path, index));
      return { ok: false };
    }
    if (previous > current) {
      appendIssue(state, "chord.degree_order", snapshot.path);
      return { ok: false };
    }
  }
  return {
    ok: true,
    value: allocateCandidateArray(state, decoded.value),
  };
}

function hasAtLeastOne<T>(values: readonly T[]): values is readonly [T, ...T[]] {
  return values.length > 0;
}

function isTriadQuality(value: string): value is ChordSpec["triad"] {
  switch (value) {
    case "major":
    case "minor":
    case "diminished":
    case "augmented":
    case "sus2":
    case "sus4":
    case "power":
      return true;
    default:
      return false;
  }
}

function isSeventhQuality(
  value: string,
): value is Exclude<ChordSpec["seventh"], null> {
  return value === "major" || value === "minor" || value === "diminished";
}

function isColorPolicy(value: string): value is ChordSpec["colorPolicy"] {
  return value === "none" || value === "altered-dominant";
}

function isAutoFamily(value: string): value is AutoVoicingFamily {
  switch (value) {
    case "balanced":
    case "shell":
    case "rootless-a":
    case "rootless-b":
    case "open":
    case "drop2":
    case "quartal":
      return true;
    default:
      return false;
  }
}

function isAutoBassPolicy(value: string): value is AutoBassPolicy {
  return value === "generated" || value === "external" || value === "none";
}

function isStoredBassPolicy(value: string): value is StoredBassPolicy {
  return value === "included" || value === "external";
}

function isInstrument(value: string): value is InstrumentId {
  return makeInstrumentId(value).ok;
}

function isGrooveStyle(value: string): value is GrooveStyleId {
  // Literal equalities, not a lookup through the imported tuple: the F2
  // source policy forbids method calls through imported state owners. The
  // groove-vocabulary static law keeps this list equal to GROOVE_STYLE_IDS.
  return (
    value === "ballad-comp@1" ||
    value === "medium-swing@1" ||
    value === "bossa-nova@1" ||
    value === "straight-eighths@1" ||
    value === "syncopated-sixteenths@1" ||
    value === "uptempo-swing@1" ||
    value === "block-chords@1"
  );
}

function isVoiceLeadingBoundary(
  value: string,
): value is SectionShape["voiceLeadingBoundary"] {
  return value === "continue" || value === "reset";
}

function decodeEnumField<T extends string>(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
  accepted: (value: string) => value is T,
  refusalCode: DocumentShapeIssueCode,
): DecodeValue<T> {
  const decoded = decodeExactString(snapshot, key, state, accepted, refusalCode);
  if (!decoded.ok) return decoded;
  if (!accepted(decoded.value)) return { ok: false };
  return { ok: true, value: decoded.value };
}

function decodeNullableSeventh(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<ChordSpec["seventh"]> {
  const path = pathWith(snapshot.path, "seventh");
  const field = requiredScalarField(snapshot, "seventh", state);
  if (!field.ok) return { ok: false };
  if (field.value === null) return { ok: true, value: null };
  if (typeof field.value !== "string" || !isSeventhQuality(field.value)) {
    appendIssue(state, "shape.invalid_type", path);
    return { ok: false };
  }
  return { ok: true, value: field.value };
}

function decodeNullableSixth(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<ChordSpec["sixth"]> {
  const path = pathWith(snapshot.path, "sixth");
  const field = requiredField(snapshot, "sixth", state, false);
  if (!field.ok) return { ok: false };
  if (field.value === null) {
    state.evidence.scalarFieldsInspected += 1;
    return { ok: true, value: null };
  }
  if (field.child?.kind !== "record" || !field.child.recordEligible) {
    appendIssue(state, "shape.invalid_type", path);
    return { ok: false };
  }
  const degree = decodeChordDegree(field.child, true, state);
  if (!degree.ok) return { ok: false };
  return { ok: true, value: degree.value };
}

function decodeParsedChord(
  snapshot: ContainerSnapshot,
  sourceText: DecodeValue<string>,
  bass: DecodeValue<SpelledPitchClass | null>,
  state: MutableDecodeState,
): DecodeValue<ChordSpec> {
  const issueCount = state.issues.length;
  const rootRecord = requiredRecordField(snapshot, "root", state);
  const root = rootRecord.ok
    ? decodeSpelledPitchClass(rootRecord.value, state)
    : { ok: false as const };
  const triad = decodeEnumField(
    snapshot,
    "triad",
    state,
    isTriadQuality,
    "shape.invalid_type",
  );
  const sixth = decodeNullableSixth(snapshot, state);
  const seventh = decodeNullableSeventh(snapshot, state);
  const extensionsArray = requiredArrayField(snapshot, "extensions", state);
  const extensions = extensionsArray.ok
    ? decodeDegreeArray(extensionsArray.value, state)
    : { ok: false as const };
  const additionsArray = requiredArrayField(snapshot, "additions", state);
  const additions = additionsArray.ok
    ? decodeDegreeArray(additionsArray.value, state)
    : { ok: false as const };
  const alterationsArray = requiredArrayField(snapshot, "alterations", state);
  const alterations = alterationsArray.ok
    ? decodeDegreeArray(alterationsArray.value, state)
    : { ok: false as const };
  const omissionsArray = requiredArrayField(snapshot, "omissions", state);
  const omissions = omissionsArray.ok
    ? decodeOmissionArray(omissionsArray.value, state)
    : { ok: false as const };
  const color = decodeEnumField(
    snapshot,
    "colorPolicy",
    state,
    isColorPolicy,
    "shape.invalid_type",
  );

  if (
    !sourceText.ok ||
    !root.ok ||
    !triad.ok ||
    !sixth.ok ||
    !seventh.ok ||
    !extensions.ok ||
    !additions.ok ||
    !alterations.ok ||
    !omissions.ok ||
    !bass.ok ||
    !color.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: ChordSpec = allocateCandidateObject(state, {
    kind: "parsed",
    sourceText: sourceText.value,
    root: root.value,
    triad: triad.value,
    sixth: sixth.value,
    seventh: seventh.value,
    extensions: extensions.value,
    additions: additions.value,
    alterations: alterations.value,
    omissions: omissions.value,
    bass: bass.value,
    colorPolicy: color.value,
  });
  return { ok: true, value: candidate };
}

function decodePitchClassArrayElements(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<SpelledPitchClass[]> {
  return decodeArrayElements(snapshot, state, (element, _index, path) => {
    state.evidence.pitchElementsSemanticallyDecoded += 1;
    if (!element.ok || element.child?.kind !== "record" || !element.child.recordEligible) {
      appendIssue(state, "shape.invalid_type", path);
      return { ok: false };
    }
    const decoded = decodeSpelledPitchClass(element.child, state);
    return decoded;
  });
}

function decodeCustomChord(
  snapshot: ContainerSnapshot,
  sourceText: DecodeValue<string>,
  bass: DecodeValue<SpelledPitchClass | null>,
  state: MutableDecodeState,
): DecodeValue<CustomChordSpec> {
  const issueCount = state.issues.length;
  const label = decodeTextField(
    snapshot,
    "label",
    {
      limit: 256,
      limitCode: "limit.custom_label_code_points_exceeded",
      blankCode: "string.blank",
    },
    state,
  );
  const pitchArray = requiredArrayField(snapshot, "pitchNames", state);
  const pitchElements = pitchArray.ok
    ? decodePitchClassArrayElements(pitchArray.value, state)
    : { ok: false as const };
  if (pitchElements.ok && !hasAtLeastOne(pitchElements.value)) {
    appendIssue(state, "custom.pitch_names_empty", pathWith(snapshot.path, "pitchNames"));
  }
  const pitches =
    pitchElements.ok && hasAtLeastOne(pitchElements.value)
      ? allocateCandidateArray(state, pitchElements.value)
      : null;
  if (pitches !== null) {
    state.evidence.pitchElementsCopied += pitches.length;
  }
  if (
    !sourceText.ok ||
    !label.ok ||
    pitches === null ||
    !hasAtLeastOne(pitches) ||
    !bass.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: CustomChordSpec = allocateCandidateObject(state, {
    kind: "custom",
    sourceText: sourceText.value,
    label: label.value,
    pitchNames: pitches,
    bass: bass.value,
  });
  return { ok: true, value: candidate };
}

function decodeChord(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<DecodedChord> {
  const discriminatorPath = pathWith(snapshot.path, "kind");
  const discriminatorField = requiredScalarField(snapshot, "kind", state);
  let discriminator: "parsed" | "custom" | null = null;
  if (
    discriminatorField.ok &&
    (discriminatorField.value === "parsed" || discriminatorField.value === "custom")
  ) {
    discriminator = discriminatorField.value;
  } else if (discriminatorField.ok) {
    appendIssue(state, "shape.invalid_type", discriminatorPath);
  }

  if (discriminator === "parsed") {
    auditRecord(
      snapshot,
      [
        "kind",
        "sourceText",
        "root",
        "triad",
        "sixth",
        "seventh",
        "extensions",
        "additions",
        "alterations",
        "omissions",
        "bass",
        "colorPolicy",
      ],
      state,
    );
  } else if (discriminator === "custom") {
    auditRecord(snapshot, ["kind", "sourceText", "label", "pitchNames", "bass"], state);
  } else {
    auditRecord(
      snapshot,
      [
        "kind",
        "sourceText",
        "root",
        "triad",
        "sixth",
        "seventh",
        "extensions",
        "additions",
        "alterations",
        "omissions",
        "bass",
        "colorPolicy",
        "label",
        "pitchNames",
      ],
      state,
    );
  }

  const sourceText = decodeTextField(
    snapshot,
    "sourceText",
    {
      limit: 256,
      limitCode: "limit.symbol_code_points_exceeded",
      blankCode: "string.blank",
    },
    state,
  );
  const bass = decodeNullablePitchClassField(snapshot, "bass", state);
  if (discriminator === "parsed") {
    return decodeParsedChord(snapshot, sourceText, bass, state);
  }
  if (discriminator === "custom") {
    return decodeCustomChord(snapshot, sourceText, bass, state);
  }
  return { ok: false };
}

function decodeMidiField(
  snapshot: ContainerSnapshot,
  key: string,
  state: MutableDecodeState,
): DecodeValue<MidiPitch> {
  const number = decodeNumberField(snapshot, key, state);
  if (!number.ok) return { ok: false };
  const checked = makeMidiPitch(number.value);
  if (!checked.ok) {
    appendIssue(state, checked.refusal.code, pathWith(snapshot.path, key));
    return { ok: false };
  }
  return { ok: true, value: checked.value };
}

function decodeMidiRange(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<AutoVoicing["range"]> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["lowMidi", "highMidi"], state);
  const low = decodeMidiField(snapshot, "lowMidi", state);
  const high = decodeMidiField(snapshot, "highMidi", state);
  if (low.ok && high.ok && low.value > high.value) {
    appendIssue(state, "voicing.range_reversed", pathWith(snapshot.path, "highMidi"));
  }
  if (!low.ok || !high.ok || state.issues.length !== issueCount) {
    return { ok: false };
  }
  const candidate: AutoVoicing["range"] = allocateCandidateObject(state, {
    lowMidi: low.value,
    highMidi: high.value,
  });
  return { ok: true, value: candidate };
}

function decodeAutoVoicing(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<DecodedAutoVoicing> {
  const issueCount = state.issues.length;
  const family = decodeEnumField(
    snapshot,
    "family",
    state,
    isAutoFamily,
    "shape.invalid_type",
  );
  const voiceCountNumber = decodeNumberField(snapshot, "voiceCount", state);
  let voiceCount: AutoVoicing["voiceCount"] | null = null;
  if (voiceCountNumber.ok) {
    const checked = makeAutoVoiceCount(voiceCountNumber.value);
    if (!checked.ok) {
      appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "voiceCount"));
    } else voiceCount = checked.value;
  }
  const rangeRecord = requiredRecordField(snapshot, "range", state);
  const range = rangeRecord.ok
    ? decodeMidiRange(rangeRecord.value, state)
    : { ok: false as const };
  const bassPolicy = decodeEnumField(
    snapshot,
    "bassPolicy",
    state,
    isAutoBassPolicy,
    "shape.invalid_type",
  );
  if (
    !family.ok ||
    voiceCount === null ||
    !range.ok ||
    !bassPolicy.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      mode: "auto",
      family: family.value,
      voiceCount,
      range: range.value,
      bassPolicy: bassPolicy.value,
    },
  };
}

function decodeStoredPitchArray(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<readonly [SpelledPitch, ...SpelledPitch[]]> {
  const elements = decodeArrayElements(snapshot, state, (element, _index, path) => {
    state.evidence.pitchElementsSemanticallyDecoded += 1;
    if (!element.ok || element.child?.kind !== "record" || !element.child.recordEligible) {
      appendIssue(state, "shape.invalid_type", path);
      return { ok: false };
    }
    const pitch = decodeSpelledPitch(element.child, state);
    return pitch;
  });
  if (!elements.ok) return { ok: false };
  if (!hasAtLeastOne(elements.value)) {
    appendIssue(state, "voicing.pitches_empty", snapshot.path);
    return { ok: false };
  }
  const candidate = allocateCandidateArray(state, elements.value);
  if (!hasAtLeastOne(candidate)) return { ok: false };
  state.evidence.pitchElementsCopied += candidate.length;
  return { ok: true, value: candidate };
}

function decodeGeneratedBy(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<FrozenVoicing["generatedBy"]> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["engineVersion", "family"], state);
  const engineVersion = decodeTextField(
    snapshot,
    "engineVersion",
    {
      limit: 64,
      limitCode: "limit.engine_version_code_points_exceeded",
      blankCode: "voicing.engine_version_invalid",
    },
    state,
  );
  const family = decodeEnumField(
    snapshot,
    "family",
    state,
    isAutoFamily,
    "shape.invalid_type",
  );
  if (!engineVersion.ok || !family.ok || state.issues.length !== issueCount) {
    return { ok: false };
  }
  const candidate: FrozenVoicing["generatedBy"] = allocateCandidateObject(state, {
    engineVersion: engineVersion.value,
    family: family.value,
  });
  return { ok: true, value: candidate };
}

function decodeManualVoicing(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<DecodedManualVoicing> {
  const issueCount = state.issues.length;
  const pitchesArray = requiredArrayField(snapshot, "pitches", state);
  const pitches = pitchesArray.ok
    ? decodeStoredPitchArray(pitchesArray.value, state)
    : { ok: false as const };
  const bassPolicy = decodeEnumField(
    snapshot,
    "bassPolicy",
    state,
    isStoredBassPolicy,
    "shape.invalid_type",
  );
  if (!pitches.ok || !bassPolicy.ok || state.issues.length !== issueCount) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      mode: "manual",
      pitches: pitches.value,
      bassPolicy: bassPolicy.value,
    },
  };
}

function decodeFrozenVoicing(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<DecodedFrozenVoicing> {
  const issueCount = state.issues.length;
  const pitchesArray = requiredArrayField(snapshot, "pitches", state);
  const pitches = pitchesArray.ok
    ? decodeStoredPitchArray(pitchesArray.value, state)
    : { ok: false as const };
  const bassPolicy = decodeEnumField(
    snapshot,
    "bassPolicy",
    state,
    isStoredBassPolicy,
    "shape.invalid_type",
  );
  const generatedRecord = requiredRecordField(snapshot, "generatedBy", state);
  const generatedBy = generatedRecord.ok
    ? decodeGeneratedBy(generatedRecord.value, state)
    : { ok: false as const };
  if (
    !pitches.ok ||
    !bassPolicy.ok ||
    !generatedBy.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      mode: "frozen",
      pitches: pitches.value,
      bassPolicy: bassPolicy.value,
      generatedBy: generatedBy.value,
    },
  };
}

function decodeInvalidVoicingCommonFields(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): void {
  const bassPolicy = requiredScalarField(snapshot, "bassPolicy", state);
  if (!bassPolicy.ok) return;
  if (
    typeof bassPolicy.value !== "string" ||
    (!isAutoBassPolicy(bassPolicy.value) && !isStoredBassPolicy(bassPolicy.value))
  ) {
    appendIssue(state, "shape.invalid_type", pathWith(snapshot.path, "bassPolicy"));
  }
}

function decodeVoicing(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<DecodedVoicing> {
  const modePath = pathWith(snapshot.path, "mode");
  const modeField = requiredScalarField(snapshot, "mode", state);
  let mode: "auto" | "manual" | "frozen" | null = null;
  if (
    modeField.ok &&
    (modeField.value === "auto" ||
      modeField.value === "manual" ||
      modeField.value === "frozen")
  ) {
    mode = modeField.value;
  } else if (modeField.ok) {
    appendIssue(state, "shape.invalid_type", modePath);
  }

  if (mode === "auto") {
    auditRecord(snapshot, ["mode", "family", "voiceCount", "range", "bassPolicy"], state);
    return decodeAutoVoicing(snapshot, state);
  }
  if (mode === "manual") {
    auditRecord(snapshot, ["mode", "pitches", "bassPolicy"], state);
    return decodeManualVoicing(snapshot, state);
  }
  if (mode === "frozen") {
    auditRecord(snapshot, ["mode", "pitches", "bassPolicy", "generatedBy"], state);
    return decodeFrozenVoicing(snapshot, state);
  }

  auditRecord(
    snapshot,
    ["mode", "family", "voiceCount", "range", "pitches", "bassPolicy", "generatedBy"],
    state,
  );
  decodeInvalidVoicingCommonFields(snapshot, state);
  return { ok: false };
}

function sameSpelling(
  left: SpelledPitchClass,
  right: SpelledPitchClass,
): boolean {
  return left.step === right.step && left.alter === right.alter;
}

function validateStoredVoicingCompatibility(
  voicing: DecodedManualVoicing | DecodedFrozenVoicing,
  chordBass: SpelledPitchClass | null,
  voicingPath: DomainPath,
  state: MutableDecodeState,
): boolean {
  if (voicing.bassPolicy === "external") {
    if (chordBass === null) {
      appendIssue(state, "voicing.external_without_slash_bass", pathWith(voicingPath, "bassPolicy"));
      return false;
    }
    const delegated = pitchClassOf(chordBass);
    for (let index = 0; index < voicing.pitches.length; index += 1) {
      const pitch = voicing.pitches[index];
      if (pitch !== undefined && pitchClassOf(pitch) === delegated) {
        appendIssue(
          state,
          "voicing.external_bass_included",
          pathWith(pathWith(voicingPath, "pitches"), index),
        );
        return false;
      }
    }
    return true;
  }

  if (chordBass === null) return true;
  const first = voicing.pitches[0];
  let minimum = soundingSemitoneOf(first);
  let firstMinimumIndex = 0;
  for (let index = 1; index < voicing.pitches.length; index += 1) {
    const pitch = voicing.pitches[index];
    if (pitch === undefined) continue;
    const sounding = soundingSemitoneOf(pitch);
    if (sounding < minimum) {
      minimum = sounding;
      firstMinimumIndex = index;
    }
  }
  let exactAtMinimum = false;
  let exactAnywhere = false;
  for (const pitch of voicing.pitches) {
    if (sameSpelling(pitch, chordBass)) {
      exactAnywhere = true;
      if (soundingSemitoneOf(pitch) === minimum) exactAtMinimum = true;
    }
  }
  if (exactAtMinimum) return true;
  appendIssue(
    state,
    exactAnywhere
      ? "voicing.included_bass_not_lowest"
      : "voicing.included_bass_spelling_mismatch",
    pathWith(pathWith(voicingPath, "pitches"), firstMinimumIndex),
  );
  return false;
}

function finalizeVoicing(
  chord: DecodedChord,
  decoded: DecodedVoicing,
  voicingPath: DomainPath,
  state: MutableDecodeState,
): DecodeValue<Voicing> {
  if (chord.kind === "custom" && decoded.mode === "auto") {
    appendIssue(state, "custom.auto_voicing_forbidden", pathWith(voicingPath, "mode"));
    return { ok: false };
  }

  if (decoded.mode === "auto") {
    if (
      (decoded.family === "rootless-a" || decoded.family === "rootless-b") &&
      decoded.bassPolicy !== "external"
    ) {
      appendIssue(state, "voicing.rootless_requires_external", pathWith(voicingPath, "bassPolicy"));
      return { ok: false };
    }
    if (
      decoded.family !== "rootless-a" &&
      decoded.family !== "rootless-b" &&
      chord.bass !== null &&
      decoded.bassPolicy === "none"
    ) {
      appendIssue(state, "voicing.slash_bass_policy_none", pathWith(voicingPath, "bassPolicy"));
      return { ok: false };
    }
    if (decoded.family === "rootless-a" || decoded.family === "rootless-b") {
      const candidate: AutoVoicing = allocateCandidateObject(state, {
        mode: "auto",
        family: decoded.family,
        voiceCount: decoded.voiceCount,
        range: decoded.range,
        bassPolicy: "external",
      });
      return { ok: true, value: candidate };
    }
    const candidate: AutoVoicing = allocateCandidateObject(state, {
      mode: "auto",
      family: decoded.family,
      voiceCount: decoded.voiceCount,
      range: decoded.range,
      bassPolicy: decoded.bassPolicy,
    });
    return { ok: true, value: candidate };
  }

  if (!validateStoredVoicingCompatibility(decoded, chord.bass, voicingPath, state)) {
    return { ok: false };
  }
  if (decoded.mode === "manual") {
    const candidate: ManualVoicing = allocateCandidateObject(state, {
      mode: "manual",
      pitches: decoded.pitches,
      bassPolicy: decoded.bassPolicy,
    });
    return { ok: true, value: candidate };
  }
  const candidate: FrozenVoicing = allocateCandidateObject(state, {
    mode: "frozen",
    pitches: decoded.pitches,
    bassPolicy: decoded.bassPolicy,
    generatedBy: decoded.generatedBy,
  });
  return { ok: true, value: candidate };
}

function hasNoBass<T extends Readonly<{ bass: SpelledPitchClass | null }>>(
  chord: T,
): chord is T & Readonly<{ bass: null }> {
  return chord.bass === null;
}

function hasBass<T extends Readonly<{ bass: SpelledPitchClass | null }>>(
  chord: T,
): chord is T & Readonly<{ bass: SpelledPitchClass }> {
  return chord.bass !== null;
}

function isIncludedStoredVoicing(
  voicing: ManualVoicing | FrozenVoicing,
): voicing is (ManualVoicing | FrozenVoicing) & Readonly<{ bassPolicy: "included" }> {
  return voicing.bassPolicy === "included";
}

function isSlashAutoVoicing(
  voicing: AutoVoicing,
): voicing is AutoVoicing & Readonly<{ bassPolicy: "generated" | "external" }> {
  return voicing.bassPolicy !== "none";
}

function createChordEventCandidate(
  id: ChordEventId,
  duration: BeatDuration,
  annotation: string,
  chord: DecodedChord,
  voicing: Voicing,
  state: MutableDecodeState,
): DecodeValue<ChordEvent> {
  if (chord.kind === "parsed") {
    if (hasNoBass(chord)) {
      if (voicing.mode !== "auto" && !isIncludedStoredVoicing(voicing)) {
        return { ok: false };
      }
      const candidate: ChordEvent = allocateCandidateObject(state, {
        id,
        duration,
        annotation,
        chord,
        voicing,
      });
      return { ok: true, value: candidate };
    }
    if (hasBass(chord)) {
      if (voicing.mode === "auto" && !isSlashAutoVoicing(voicing)) {
        return { ok: false };
      }
      const candidate: ChordEvent = allocateCandidateObject(state, {
        id,
        duration,
        annotation,
        chord,
        voicing,
      });
      return { ok: true, value: candidate };
    }
  }

  if (chord.kind === "custom" && voicing.mode !== "auto") {
    if (hasNoBass(chord)) {
      if (!isIncludedStoredVoicing(voicing)) return { ok: false };
      const candidate: ChordEvent = allocateCandidateObject(state, {
        id,
        duration,
        annotation,
        chord,
        voicing,
      });
      return { ok: true, value: candidate };
    }
    if (hasBass(chord)) {
      const candidate: ChordEvent = allocateCandidateObject(state, {
        id,
        duration,
        annotation,
        chord,
        voicing,
      });
      return { ok: true, value: candidate };
    }
  }
  return { ok: false };
}

function decodeEvent(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<ChordEvent> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["id", "duration", "annotation", "chord", "voicing"], state);
  const id = decodeStableId(snapshot, "id", "event", state);
  const durationRecord = requiredRecordField(snapshot, "duration", state);
  const duration = durationRecord.ok
    ? decodeBeat(durationRecord.value, true, state)
    : { ok: false as const };
  if (duration.ok) {
    const ticks =
      (BigInt(duration.value.numerator) * BigInt(MIDI_PPQ)) /
      BigInt(duration.value.denominator);
    state.timelineTicks += ticks;
    state.evidence.timelineAdditions += 1;
    const stoppingWitness = BigInt(MAX_TIMELINE_QUARTER_NOTE_BEATS * MIDI_PPQ + 1);
    state.evidence.timelineTicksObserved = Number(
      state.timelineTicks > stoppingWitness ? stoppingWitness : state.timelineTicks,
    );
  }
  const annotation = decodeTextField(
    snapshot,
    "annotation",
    {
      limit: 2_000,
      limitCode: "limit.annotation_code_points_exceeded",
      blankCode: null,
    },
    state,
  );
  const chordRecord = requiredRecordField(snapshot, "chord", state);
  const chord = chordRecord.ok
    ? decodeChord(chordRecord.value, state)
    : { ok: false as const };
  const voicingRecord = requiredRecordField(snapshot, "voicing", state);
  const decodedVoicing = voicingRecord.ok
    ? decodeVoicing(voicingRecord.value, state)
    : { ok: false as const };
  const voicing =
    chord.ok && decodedVoicing.ok && voicingRecord.ok
      ? finalizeVoicing(chord.value, decodedVoicing.value, voicingRecord.value.path, state)
      : { ok: false as const };

  if (
    !id.ok ||
    !duration.ok ||
    !annotation.ok ||
    !chord.ok ||
    !voicing.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  return createChordEventCandidate(
    id.value,
    duration.value,
    annotation.value,
    chord.value,
    voicing.value,
    state,
  );
}

function decodeCompletion(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<MeasureCompletionShape> {
  const issueCount = state.issues.length;
  const kindPath = pathWith(snapshot.path, "kind");
  const kindField = requiredScalarField(snapshot, "kind", state);
  let kind: "empty" | "complete" | "pickup" | "incomplete" | null = null;
  if (
    kindField.ok &&
    (kindField.value === "empty" ||
      kindField.value === "complete" ||
      kindField.value === "pickup" ||
      kindField.value === "incomplete")
  ) {
    kind = kindField.value;
  } else if (kindField.ok) {
    appendIssue(state, "shape.invalid_type", kindPath);
  }

  if (kind === "empty" || kind === "complete") {
    auditRecord(snapshot, ["kind"], state);
    if (state.issues.length !== issueCount) return { ok: false };
    const candidate: MeasureCompletionShape = allocateCandidateObject(state, { kind });
    return { ok: true, value: candidate };
  }
  if (kind === "pickup" || kind === "incomplete") {
    auditRecord(snapshot, ["kind", "expectedDuration", "reason"], state);
    const expectedRecord = requiredRecordField(snapshot, "expectedDuration", state);
    const expectedDuration = expectedRecord.ok
      ? decodeBeat(expectedRecord.value, false, state)
      : { ok: false as const };
    const reason = decodeTextField(
      snapshot,
      "reason",
      {
        limit: 2_000,
        limitCode: "limit.reason_code_points_exceeded",
        blankCode: null,
      },
      state,
    );
    if (
      !expectedDuration.ok ||
      !reason.ok ||
      state.issues.length !== issueCount
    ) {
      return { ok: false };
    }
    const candidate: MeasureCompletionShape = allocateCandidateObject(state, {
      kind,
      expectedDuration: expectedDuration.value,
      reason: reason.value,
    });
    return { ok: true, value: candidate };
  }
  auditRecord(snapshot, ["kind", "expectedDuration", "reason"], state);
  return { ok: false };
}

function decodeMeasure(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<MeasureShape> {
  const issueCount = state.issues.length;
  auditRecord(snapshot, ["id", "events", "completion"], state);
  const id = decodeStableId(snapshot, "id", "measure", state);
  const eventsArray = requiredArrayField(snapshot, "events", state);
  const events = eventsArray.ok
    ? decodeArray(eventsArray.value, state, (element, _index, path) => {
        state.evidence.eventValuesSemanticallyDecoded += 1;
        if (!element.ok || element.child?.kind !== "record" || !element.child.recordEligible) {
          appendIssue(state, "shape.invalid_type", path);
          return { ok: false };
        }
        return decodeEvent(element.child, state);
      })
    : { ok: false as const };
  if (events.ok) state.evidence.eventValuesCopied += events.value.length;
  const completionRecord = requiredRecordField(snapshot, "completion", state);
  const completion = completionRecord.ok
    ? decodeCompletion(completionRecord.value, state)
    : { ok: false as const };
  if (
    !id.ok ||
    !events.ok ||
    !completion.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: MeasureShape = allocateCandidateObject(state, {
    id: id.value,
    events: events.value,
    completion: completion.value,
  });
  return { ok: true, value: candidate };
}

function decodeSection(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<SectionShape> {
  const issueCount = state.issues.length;
  auditRecord(
    snapshot,
    ["id", "name", "annotation", "keyOverride", "voiceLeadingBoundary", "measures"],
    state,
  );
  const id = decodeStableId(snapshot, "id", "section", state);
  const name = decodeTextField(
    snapshot,
    "name",
    {
      limit: 256,
      limitCode: "limit.section_name_code_points_exceeded",
      blankCode: "string.blank",
    },
    state,
  );
  const annotation = decodeTextField(
    snapshot,
    "annotation",
    {
      limit: 2_000,
      limitCode: "limit.annotation_code_points_exceeded",
      blankCode: null,
    },
    state,
  );
  const keyOverride = decodeNullableKeyField(snapshot, "keyOverride", state);
  const boundary = decodeEnumField(
    snapshot,
    "voiceLeadingBoundary",
    state,
    isVoiceLeadingBoundary,
    "section.voice_leading_boundary_invalid",
  );
  const measuresArray = requiredArrayField(snapshot, "measures", state);
  const measures = measuresArray.ok
    ? decodeArray(measuresArray.value, state, (element, _index, path) => {
        state.evidence.measureElementsSemanticallyDecoded += 1;
        if (!element.ok || element.child?.kind !== "record" || !element.child.recordEligible) {
          appendIssue(state, "shape.invalid_type", path);
          return { ok: false };
        }
        return decodeMeasure(element.child, state);
      })
    : { ok: false as const };
  if (measures.ok) state.evidence.measureElementsCopied += measures.value.length;
  if (
    !id.ok ||
    !name.ok ||
    !annotation.ok ||
    !keyOverride.ok ||
    !boundary.ok ||
    !measures.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: SectionShape = allocateCandidateObject(state, {
    id: id.value,
    name: name.value,
    annotation: annotation.value,
    keyOverride: keyOverride.value,
    voiceLeadingBoundary: boundary.value,
    measures: measures.value,
  });
  return { ok: true, value: candidate };
}

function decodePlaybackLevel(
  snapshot: ContainerSnapshot,
  key: "masterVolume" | "reverbAmount",
  state: MutableDecodeState,
): DecodeValue<number> {
  const number = decodeNumberField(snapshot, key, state);
  if (!number.ok) return number;
  if (!Number.isFinite(number.value)) {
    appendIssue(state, "playback.level_not_finite", pathWith(snapshot.path, key));
    return { ok: false };
  }
  if (number.value < 0 || number.value > 1) {
    appendIssue(state, "playback.level_out_of_range", pathWith(snapshot.path, key));
    return { ok: false };
  }
  return number;
}

function decodePlayback(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<PlaybackSettings> {
  const issueCount = state.issues.length;
  auditRecord(
    snapshot,
    [
      "instrumentId",
      "masterVolume",
      "reverbAmount",
      "countInBars",
      "grooveStyleId",
    ],
    state,
  );
  const instrument = decodeEnumField(
    snapshot,
    "instrumentId",
    state,
    isInstrument,
    "document.instrument_id_invalid",
  );
  const masterVolume = decodePlaybackLevel(snapshot, "masterVolume", state);
  const reverbAmount = decodePlaybackLevel(snapshot, "reverbAmount", state);
  const countNumber = decodeNumberField(snapshot, "countInBars", state);
  let countInBars: PlaybackSettings["countInBars"] | null = null;
  if (countNumber.ok) {
    if (
      countNumber.value === 0 ||
      countNumber.value === 1 ||
      countNumber.value === 2
    ) {
      countInBars = countNumber.value;
    } else {
      appendIssue(state, "playback.count_in_bars_invalid", pathWith(snapshot.path, "countInBars"));
    }
  }
  /*
   * jcpe-jnnu: the one optional persisted property in v2. Absence means the
   * default groove; a stored explicit default is noncanonical and refuses
   * (the beat.not_normalized precedent), so absent-in decodes absent-out and
   * the canonical wire form stays unique.
   */
  let grooveStyleId: PlaybackSettings["grooveStyleId"];
  let grooveOk = true;
  if (snapshot.descriptors.get("grooveStyleId") !== undefined) {
    const groove = decodeEnumField(
      snapshot,
      "grooveStyleId",
      state,
      isGrooveStyle,
      "playback.groove_style_invalid",
    );
    if (!groove.ok) {
      grooveOk = false;
    } else if (groove.value === DEFAULT_GROOVE_STYLE_ID) {
      appendIssue(
        state,
        "playback.groove_style_not_canonical",
        pathWith(snapshot.path, "grooveStyleId"),
      );
      grooveOk = false;
    } else {
      grooveStyleId = groove.value;
    }
  }
  if (
    !instrument.ok ||
    !masterVolume.ok ||
    !reverbAmount.ok ||
    countInBars === null ||
    !grooveOk ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  if (grooveStyleId === undefined) {
    const candidate: PlaybackSettings = allocateCandidateObject(state, {
      instrumentId: instrument.value,
      masterVolume: masterVolume.value,
      reverbAmount: reverbAmount.value,
      countInBars,
    });
    return { ok: true, value: candidate };
  }
  const candidate: PlaybackSettings = allocateCandidateObject(state, {
    instrumentId: instrument.value,
    masterVolume: masterVolume.value,
    reverbAmount: reverbAmount.value,
    countInBars,
    grooveStyleId,
  });
  return { ok: true, value: candidate };
}

function decodeTempo(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<number> {
  const tempo = decodeNumberField(snapshot, "tempoBpm", state);
  if (!tempo.ok) return tempo;
  const checked = makeTempoBpm(tempo.value);
  if (!checked.ok) {
    appendIssue(state, checked.refusal.code, pathWith(snapshot.path, "tempoBpm"));
    return { ok: false };
  }
  return { ok: true, value: checked.value };
}

function decodeSchema(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<typeof PROGRESSION_DOCUMENT_SCHEMA> {
  const path = pathWith(snapshot.path, "schema");
  const field = requiredField(snapshot, "schema", state, true);
  if (!field.ok) return { ok: false };
  state.evidence.scalarFieldsInspected += 1;
  if (field.value !== PROGRESSION_DOCUMENT_SCHEMA) {
    appendIssue(state, "document.schema_invalid", path);
    return { ok: false };
  }
  return { ok: true, value: PROGRESSION_DOCUMENT_SCHEMA };
}

function decodeDocument(
  snapshot: ContainerSnapshot,
  state: MutableDecodeState,
): DecodeValue<ProgressionDocumentShapeV2> {
  const issueCount = state.issues.length;
  auditRecord(
    snapshot,
    ["schema", "id", "title", "description", "meter", "tempoBpm", "key", "sections", "playback"],
    state,
  );
  const schema = decodeSchema(snapshot, state);
  const id = decodeStableId(snapshot, "id", "document", state);
  const title = decodeTextField(
    snapshot,
    "title",
    {
      limit: 256,
      limitCode: "limit.title_code_points_exceeded",
      blankCode: "string.blank",
    },
    state,
  );
  const description = decodeTextField(
    snapshot,
    "description",
    {
      limit: 2_000,
      limitCode: "limit.description_code_points_exceeded",
      blankCode: null,
    },
    state,
  );
  const meterRecord = requiredRecordField(snapshot, "meter", state);
  const meter = meterRecord.ok
    ? decodeMeter(meterRecord.value, state)
    : { ok: false as const };
  const tempo = decodeTempo(snapshot, state);
  const key = decodeNullableKeyField(snapshot, "key", state);
  const sectionsArray = requiredArrayField(snapshot, "sections", state);
  const sections = sectionsArray.ok
    ? decodeArray(sectionsArray.value, state, (element, _index, path) => {
        state.evidence.sectionElementsSemanticallyDecoded += 1;
        if (!element.ok || element.child?.kind !== "record" || !element.child.recordEligible) {
          appendIssue(state, "shape.invalid_type", path);
          return { ok: false };
        }
        return decodeSection(element.child, state);
      })
    : { ok: false as const };
  if (sections.ok) state.evidence.sectionElementsCopied += sections.value.length;
  const playbackRecord = requiredRecordField(snapshot, "playback", state);
  const playback = playbackRecord.ok
    ? decodePlayback(playbackRecord.value, state)
    : { ok: false as const };

  if (
    !schema.ok ||
    !id.ok ||
    !title.ok ||
    !description.ok ||
    !meter.ok ||
    !tempo.ok ||
    !key.ok ||
    !sections.ok ||
    !playback.ok ||
    state.issues.length !== issueCount
  ) {
    return { ok: false };
  }
  const candidate: ProgressionDocumentShapeV2 = allocateCandidateObject(state, {
    schema: schema.value,
    id: id.value,
    title: title.value,
    description: description.value,
    meter: meter.value,
    tempoBpm: tempo.value,
    key: key.value,
    sections: sections.value,
    playback: playback.value,
  });
  return { ok: true, value: candidate };
}

function preflightDocumentImportBytesCore(
  utf8ByteLength: number,
): DocumentImportBytePreflightWithEvidenceResult {
  const evidence = createEvidence();
  let result: DocumentImportBytePreflightResult;
  if (
    typeof utf8ByteLength !== "number" ||
    !Number.isSafeInteger(utf8ByteLength) ||
    utf8ByteLength < 0 ||
    Object.is(utf8ByteLength, -0)
  ) {
    evidence.diagnosticCandidatesProduced += 1;
    const errors = Object.freeze([
      makeImportIssue("shape.invalid_type"),
    ]) as readonly [DocumentDecoderIssue<"shape.invalid_type">];
    result = Object.freeze({ ok: false, errors });
  } else if (utf8ByteLength > MAX_UTF8_IMPORT_BYTES) {
    evidence.bytesObserved = utf8ByteLength;
    evidence.diagnosticCandidatesProduced += 1;
    const errors = Object.freeze([
      makeImportIssue("limit.import_bytes_exceeded"),
    ]) as readonly [DocumentDecoderIssue<"limit.import_bytes_exceeded">];
    result = Object.freeze({ ok: false, errors });
  } else {
    evidence.bytesObserved = utf8ByteLength;
    const warnings: readonly [] = Object.freeze([]);
    result = Object.freeze({
      ok: true,
      value: Object.freeze({ utf8ByteLength }),
      warnings,
    });
  }
  return Object.freeze({ result, evidence: freezeEvidence(evidence) });
}

function decodeDocumentShapeCore(
  input: unknown,
): DocumentShapeDecodeWithEvidenceResult {
  const evidence = createEvidence();
  if (!isObjectValue(input) || typeof input === "function") {
    const result = singleFailureResult("document.root_not_object", [], evidence);
    return Object.freeze({ result, evidence: freezeEvidence(evidence) });
  }

  let rootIsArray: boolean;
  try {
    rootIsArray = Array.isArray(input);
  } catch {
    const result = singleFailureResult("shape.invalid_type", [], evidence);
    return Object.freeze({ result, evidence: freezeEvidence(evidence) });
  }
  if (rootIsArray || isBoxedPrimitive(input)) {
    const result = singleFailureResult("document.root_not_object", [], evidence);
    return Object.freeze({ result, evidence: freezeEvidence(evidence) });
  }

  const depth = depthPreflight(input, evidence);
  if (!depth.ok) {
    const result = singleFailureResult(depth.code, depth.path, evidence);
    return Object.freeze({ result, evidence: freezeEvidence(evidence) });
  }
  const collections = collectionPreflight(depth.root, evidence);
  if (!collections.ok) {
    const result = singleFailureResult(collections.code, collections.path, evidence);
    return Object.freeze({ result, evidence: freezeEvidence(evidence) });
  }

  const state: MutableDecodeState = {
    evidence,
    issues: [],
    idPaths: new Map<string, DomainPath[]>(),
    timelineTicks: 0n,
  };
  const candidate = decodeDocument(depth.root, state);
  appendDuplicateIdIssues(state);
  if (state.timelineTicks > BigInt(MAX_TIMELINE_QUARTER_NOTE_BEATS * MIDI_PPQ)) {
    appendIssue(state, "timeline.total_exceeded", ["sections"]);
  }
  if (!candidate.ok && state.issues.length === 0) {
    appendIssue(state, "shape.invalid_type", []);
  }

  const result =
    state.issues.length === 0 && candidate.ok
      ? successResult(candidate.value)
      : failureResult(state.issues);
  return Object.freeze({ result, evidence: freezeEvidence(evidence) });
}

export function preflightDocumentImportBytes(
  utf8ByteLength: number,
): DocumentImportBytePreflightResult {
  return preflightDocumentImportBytesCore(utf8ByteLength).result;
}

export function preflightDocumentImportBytesWithEvidence(
  utf8ByteLength: number,
): DocumentImportBytePreflightWithEvidenceResult {
  return preflightDocumentImportBytesCore(utf8ByteLength);
}

export function decodeDocumentShape(input: unknown): DocumentShapeDecodeResult {
  return decodeDocumentShapeCore(input).result;
}

export function decodeDocumentShapeWithEvidence(
  input: unknown,
): DocumentShapeDecodeWithEvidenceResult {
  return decodeDocumentShapeCore(input);
}

export const documentDecodeOperations: DocumentDecodeOperations = Object.freeze({
  preflightDocumentImportBytes,
  decodeDocumentShape,
});
