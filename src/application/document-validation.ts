import {
  addBeatValues,
  compareBeatValues,
  compareValidationIssues,
  makeBeatDuration,
  makeChordEvent,
  makeMeter,
  makePlaybackSettings,
  measureCapacity,
  normalizeBeatValue,
  projectSpelledPitch,
  type BeatDuration,
  type BeatValue,
  type ChordDegree,
  type ChordEvent,
  type ChordSpec,
  type DomainPath,
  type F3SemanticIssueCode,
  type KeyContext,
  type Measure,
  type MeasureCompletion,
  type MeasureShape,
  type PlaybackSettings,
  type ProgressionDocumentShapeV2,
  type ProgressionDocumentV2,
  type Section,
  type SpelledPitch,
  type SpelledPitchClass,
  type ValidatedDocument,
} from "../domain";
import {
  parseChordSymbol,
  resolveChord,
  type ResolvedChord,
} from "../theory";
import {
  DOCUMENT_SOURCE_PARSE_ACCIDENTAL_STYLE,
  DOCUMENT_VALIDATION_CONTRACT_SCHEMA,
  DOCUMENT_SEMANTICS_POLICY_ID,
  DOCUMENT_SEMANTICS_POLICY_VERSION,
  type DocumentSemanticIssue,
  type DocumentSemanticValidationResult,
  type DocumentValidationEvidence,
  type DocumentValidationWorkCounters,
  type ValidateDocumentSemantics,
} from "./document-validation-contract";

type MutableWorkCounters = {
  -readonly [Key in keyof DocumentValidationWorkCounters]: number;
};

type ValidationState = Readonly<{
  counters: MutableWorkCounters;
  issues: DocumentSemanticIssue[];
}>;

type ProjectedStoredPitch = Readonly<{
  pitch: SpelledPitch;
  midi: number;
}>;

type DocumentValidationWithEvidenceResult = Readonly<{
  result: DocumentSemanticValidationResult;
  evidence: DocumentValidationEvidence;
}>;

const INTERNAL_INVARIANT_ERROR =
  "F3_INTERNAL_INVARIANT: F2 candidate violated its typed precondition";

function issueMessage(code: F3SemanticIssueCode): string {
  switch (code) {
    case "chord.source_semantic_mismatch":
      return "Stored chord semantics are not independently realizable.";
    case "custom.pitch_voicing_mismatch":
      return "Stored pitches do not exactly realize the custom chord.";
    case "measure.empty_has_events":
      return "An empty measure cannot contain chord events.";
    case "measure.nonempty_has_no_events":
      return "A nonempty measure must contain at least one chord event.";
    case "measure.complete_duration_mismatch":
      return "A complete measure must exactly fill its meter capacity.";
    case "measure.duration_over_capacity":
      return "The measure duration exceeds its meter capacity.";
    case "measure.expected_duration_not_short":
      return "A partial duration must be shorter than meter capacity.";
    case "measure.expected_duration_not_positive":
      return "A partial duration must be positive.";
    case "measure.expected_duration_mismatch":
      return "A partial duration must equal the exact chord-event sum.";
    case "measure.reason_blank":
      return "A partial measure requires a nonblank reason.";
  }
}

function immutablePath(...segments: readonly (string | number)[]): DomainPath {
  return Object.freeze([...segments]);
}

function appendIssue(
  state: ValidationState,
  code: F3SemanticIssueCode,
  path: DomainPath,
): void {
  state.issues.push(
    Object.freeze({
      code,
      path: Object.freeze([...path]),
      message: issueMessage(code),
    }),
  );
}

function samePitchClass(
  left: SpelledPitchClass | null,
  right: SpelledPitchClass | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.step === right.step && left.alter === right.alter;
}

function sameDegree(
  left: ChordDegree | null,
  right: ChordDegree | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.number === right.number && left.alter === right.alter;
}

function sameDegrees(
  left: readonly ChordDegree[],
  right: readonly ChordDegree[],
): boolean {
  return (
    left.length === right.length &&
    left.every((degree, index) => sameDegree(degree, right[index] ?? null))
  );
}

function sameNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameParsedChordAst(left: ChordSpec, right: ChordSpec): boolean {
  return (
    samePitchClass(left.root, right.root) &&
    left.triad === right.triad &&
    sameDegree(left.sixth, right.sixth) &&
    left.seventh === right.seventh &&
    sameDegrees(left.extensions, right.extensions) &&
    sameDegrees(left.additions, right.additions) &&
    sameDegrees(left.alterations, right.alterations) &&
    sameNumbers(left.omissions, right.omissions) &&
    samePitchClass(left.bass, right.bass) &&
    left.colorPolicy === right.colorPolicy
  );
}

function pitchClassKey(pitch: SpelledPitchClass): string {
  return `${pitch.step}:${String(pitch.alter)}`;
}

function pitchClassSet(
  pitches: readonly SpelledPitchClass[],
): ReadonlySet<string> {
  return new Set(pitches.map(pitchClassKey));
}

function isSubset(
  subset: ReadonlySet<string>,
  superset: ReadonlySet<string>,
): boolean {
  for (const value of subset) {
    if (!superset.has(value)) return false;
  }
  return true;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && isSubset(left, right);
}

function projectStoredPitches(
  pitches: readonly SpelledPitch[],
): readonly ProjectedStoredPitch[] | null {
  const projected: ProjectedStoredPitch[] = [];
  for (const pitch of pitches) {
    const result = projectSpelledPitch(pitch);
    if (!result.ok) return null;
    projected.push(Object.freeze({ pitch, midi: result.value.midi }));
  }
  return projected;
}

function chordBodyPitchClasses(
  pitches: readonly ProjectedStoredPitch[],
  bass: SpelledPitchClass | null,
  bassPolicy: "included" | "external",
): readonly SpelledPitchClass[] {
  if (bass === null || bassPolicy !== "included") {
    return pitches.map((entry) => entry.pitch);
  }

  let minimumMidi = Number.POSITIVE_INFINITY;
  for (const entry of pitches) minimumMidi = Math.min(minimumMidi, entry.midi);
  return pitches
    .filter(
      (entry) =>
        entry.midi !== minimumMidi || !samePitchClass(entry.pitch, bass),
    )
    .map((entry) => entry.pitch);
}

function storedPitchesMatchResolvedChord(
  resolved: ResolvedChord,
  pitches: readonly SpelledPitchClass[],
): boolean {
  const written = pitchClassSet(pitches);
  if (resolved.source.kind === "custom") {
    return sameSet(
      written,
      pitchClassSet(resolved.realizations[0].spelledPitchNames),
    );
  }
  return resolved.realizations.some((realization) =>
    isSubset(written, pitchClassSet(realization.spelledPitchNames)),
  );
}

function validateEvent(
  event: ChordEvent,
  path: DomainPath,
  state: ValidationState,
): void {
  state.counters.eventsVisited += 1;

  if (event.chord.kind === "parsed") {
    state.counters.symbolParseCalls += 1;
    const parsed = parseChordSymbol(
      event.chord.sourceText,
      DOCUMENT_SOURCE_PARSE_ACCIDENTAL_STYLE,
    );
    if (!parsed.ok || !sameParsedChordAst(event.chord, parsed.chord)) {
      appendIssue(
        state,
        "chord.source_semantic_mismatch",
        immutablePath(...path, "chord", "sourceText"),
      );
    }
  }

  state.counters.resolutionCalls += 1;
  const resolution = resolveChord(event.chord);
  if (!resolution.ok) {
    appendIssue(
      state,
      "chord.source_semantic_mismatch",
      immutablePath(...path, "chord", ...resolution.refusal.path),
    );
  }

  state.counters.voicingChecks += 1;
  if (event.voicing.mode === "auto") {
    const availableMidiSlots =
      event.voicing.range.highMidi - event.voicing.range.lowMidi + 1;
    if (availableMidiSlots < event.voicing.voiceCount) {
      appendIssue(
        state,
        "chord.source_semantic_mismatch",
        immutablePath(...path, "voicing", "range"),
      );
    }
    return;
  }

  const projected = projectStoredPitches(event.voicing.pitches);
  const mismatchCode =
    event.chord.kind === "custom"
      ? "custom.pitch_voicing_mismatch"
      : "chord.source_semantic_mismatch";
  if (projected === null) {
    appendIssue(
      state,
      mismatchCode,
      immutablePath(...path, "voicing", "pitches"),
    );
    return;
  }
  if (resolution.ok) {
    const body = chordBodyPitchClasses(
      projected,
      event.chord.bass,
      event.voicing.bassPolicy,
    );
    if (!storedPitchesMatchResolvedChord(resolution.value, body)) {
      appendIssue(
        state,
        mismatchCode,
        immutablePath(...path, "voicing", "pitches"),
      );
    }
  }
}

function zeroBeat(): BeatValue {
  const result = normalizeBeatValue({ numerator: 0, denominator: 1 });
  if (!result.ok) throw new Error(INTERNAL_INVARIANT_ERROR);
  return result.value;
}

function addExactBeatValues(left: BeatValue, right: BeatValue): BeatValue {
  const result = addBeatValues(left, right);
  if (!result.ok) throw new Error(INTERNAL_INVARIANT_ERROR);
  return result.value;
}

function validateMeasure(
  measure: MeasureShape,
  capacity: BeatDuration,
  path: DomainPath,
  state: ValidationState,
): void {
  state.counters.measuresVisited += 1;
  let sum = zeroBeat();
  let firstCapacityCrossing = -1;

  measure.events.forEach((event, eventIndex) => {
    const eventPath = immutablePath(...path, "events", eventIndex);
    validateEvent(event, eventPath, state);
    state.counters.exactBeatAdditions += 1;
    sum = addExactBeatValues(sum, event.duration);
    if (
      firstCapacityCrossing === -1 &&
      compareBeatValues(sum, capacity) > 0
    ) {
      firstCapacityCrossing = eventIndex;
    }
  });

  if (measure.completion.kind === "empty" && measure.events.length > 0) {
    appendIssue(
      state,
      "measure.empty_has_events",
      immutablePath(...path, "events", 0),
    );
  }
  if (measure.completion.kind !== "empty" && measure.events.length === 0) {
    appendIssue(
      state,
      "measure.nonempty_has_no_events",
      immutablePath(...path, "events"),
    );
  }

  if (
    measure.completion.kind === "complete" &&
    compareBeatValues(sum, capacity) !== 0
  ) {
    appendIssue(
      state,
      "measure.complete_duration_mismatch",
      immutablePath(...path, "completion"),
    );
  }

  if (firstCapacityCrossing >= 0) {
    appendIssue(
      state,
      "measure.duration_over_capacity",
      immutablePath(
        ...path,
        "events",
        firstCapacityCrossing,
        "duration",
      ),
    );
  }

  if (
    measure.completion.kind === "pickup" ||
    measure.completion.kind === "incomplete"
  ) {
    const expectedPath = immutablePath(
      ...path,
      "completion",
      "expectedDuration",
    );
    if (compareBeatValues(measure.completion.expectedDuration, capacity) >= 0) {
      appendIssue(state, "measure.expected_duration_not_short", expectedPath);
    }
    if (compareBeatValues(measure.completion.expectedDuration, zeroBeat()) <= 0) {
      appendIssue(
        state,
        "measure.expected_duration_not_positive",
        expectedPath,
      );
    }
    if (compareBeatValues(measure.completion.expectedDuration, sum) !== 0) {
      appendIssue(state, "measure.expected_duration_mismatch", expectedPath);
    }
    if (measure.completion.reason.trim().length === 0) {
      appendIssue(
        state,
        "measure.reason_blank",
        immutablePath(...path, "completion", "reason"),
      );
    }
  }
}

function collapseAndSortIssues(
  issues: readonly DocumentSemanticIssue[],
): readonly DocumentSemanticIssue[] {
  const ordered = [...issues].sort(compareValidationIssues);
  const collapsed: DocumentSemanticIssue[] = [];
  for (const issue of ordered) {
    const previous = collapsed[collapsed.length - 1];
    if (
      previous === undefined ||
      compareValidationIssues(previous, issue) !== 0
    ) {
      collapsed.push(issue);
    }
  }
  return Object.freeze(collapsed);
}

function requireBeatDuration(value: BeatValue): BeatDuration {
  const result = makeBeatDuration(value);
  if (!result.ok) throw new Error(INTERNAL_INVARIANT_ERROR);
  return result.value;
}

function cloneEvent(event: ChordEvent): ChordEvent {
  const result = makeChordEvent({
    id: event.id,
    duration: requireBeatDuration(event.duration),
    annotation: event.annotation,
    chord: event.chord,
    voicing: event.voicing,
  });
  if (!result.ok) throw new Error(INTERNAL_INVARIANT_ERROR);
  return result.value;
}

function cloneMeasureCompletion(
  completion: MeasureShape["completion"],
): Exclude<MeasureCompletion, { kind: "empty" }> {
  if (completion.kind === "empty") throw new Error(INTERNAL_INVARIANT_ERROR);
  if (completion.kind === "complete") {
    return Object.freeze({ kind: "complete" });
  }
  if (!("expectedDuration" in completion) || !("reason" in completion)) {
    throw new Error(INTERNAL_INVARIANT_ERROR);
  }
  return Object.freeze({
    kind: completion.kind,
    expectedDuration: requireBeatDuration(completion.expectedDuration),
    reason: completion.reason,
  });
}

function clonePublishedMeasure(
  measure: MeasureShape,
  state: ValidationState,
): Measure {
  state.counters.publicationNodeVisits += 1;
  const events = measure.events.map((event) => {
    state.counters.publicationNodeVisits += 1;
    return cloneEvent(event);
  });
  if (measure.completion.kind === "empty") {
    if (events.length !== 0) throw new Error(INTERNAL_INVARIANT_ERROR);
    const emptyEvents: readonly [] = Object.freeze([]);
    return Object.freeze({
      id: measure.id,
      events: emptyEvents,
      completion: Object.freeze({ kind: "empty" }),
    });
  }

  const [firstEvent, ...remainingEvents] = events;
  if (firstEvent === undefined) throw new Error(INTERNAL_INVARIANT_ERROR);
  const nonemptyEvents: readonly [ChordEvent, ...ChordEvent[]] = Object.freeze([
    firstEvent,
    ...remainingEvents,
  ]);
  return Object.freeze({
    id: measure.id,
    events: nonemptyEvents,
    completion: cloneMeasureCompletion(measure.completion),
  });
}

function cloneKey(key: KeyContext | null): KeyContext | null {
  if (key === null) return null;
  return Object.freeze({
    tonic: Object.freeze({ step: key.tonic.step, alter: key.tonic.alter }),
    mode: key.mode,
  });
}

function clonePlayback(playback: PlaybackSettings): PlaybackSettings {
  const result = makePlaybackSettings(playback);
  if (!result.ok) throw new Error(INTERNAL_INVARIANT_ERROR);
  return result.value;
}

function publishDocument(
  candidate: ProgressionDocumentShapeV2,
  state: ValidationState,
): ValidatedDocument {
  const meterResult = makeMeter(candidate.meter);
  if (!meterResult.ok) throw new Error(INTERNAL_INVARIANT_ERROR);

  state.counters.publicationNodeVisits += 1;
  const sections: Section[] = candidate.sections.map((section) => {
    state.counters.publicationNodeVisits += 1;
    return Object.freeze({
      id: section.id,
      name: section.name,
      annotation: section.annotation,
      keyOverride: cloneKey(section.keyOverride),
      voiceLeadingBoundary: section.voiceLeadingBoundary,
      measures: Object.freeze(
        section.measures.map((measure) => clonePublishedMeasure(measure, state)),
      ),
    });
  });
  const published: ProgressionDocumentV2 = Object.freeze({
    schema: candidate.schema,
    id: candidate.id,
    title: candidate.title,
    description: candidate.description,
    meter: meterResult.value,
    tempoBpm: candidate.tempoBpm,
    key: cloneKey(candidate.key),
    sections: Object.freeze(sections),
    playback: clonePlayback(candidate.playback),
  });
  return published as ValidatedDocument;
}

function initialCounters(): MutableWorkCounters {
  return {
    sectionsVisited: 0,
    measuresVisited: 0,
    eventsVisited: 0,
    symbolParseCalls: 0,
    resolutionCalls: 0,
    voicingChecks: 0,
    exactBeatAdditions: 0,
    publicationNodeVisits: 0,
    issuesEmitted: 0,
  };
}

function freezeCounters(
  counters: MutableWorkCounters,
): DocumentValidationWorkCounters {
  return Object.freeze({ ...counters });
}

export function validateDocumentSemanticsWithEvidence(
  candidate: ProgressionDocumentShapeV2,
): DocumentValidationWithEvidenceResult {
  const state: ValidationState = {
    counters: initialCounters(),
    issues: [],
  };
  const capacity = measureCapacity(candidate.meter);

  candidate.sections.forEach((section, sectionIndex) => {
    state.counters.sectionsVisited += 1;
    section.measures.forEach((measure, measureIndex) => {
      validateMeasure(
        measure,
        capacity,
        immutablePath("sections", sectionIndex, "measures", measureIndex),
        state,
      );
    });
  });

  const errors = collapseAndSortIssues(state.issues);
  state.counters.issuesEmitted = errors.length;
  if (errors.length > 0) {
    const [first, ...remaining] = errors;
    if (first === undefined) throw new Error(INTERNAL_INVARIANT_ERROR);
    const nonemptyErrors: readonly [
      DocumentSemanticIssue,
      ...DocumentSemanticIssue[],
    ] = Object.freeze([first, ...remaining]);
    return Object.freeze({
      result: Object.freeze({ ok: false, errors: nonemptyErrors }),
      evidence: Object.freeze({
        contractSchema: DOCUMENT_VALIDATION_CONTRACT_SCHEMA,
        policyId: DOCUMENT_SEMANTICS_POLICY_ID,
        policyVersion: DOCUMENT_SEMANTICS_POLICY_VERSION,
        termination: "complete-refusal",
        counters: freezeCounters(state.counters),
      }),
    });
  }

  const value = publishDocument(candidate, state);
  const warnings: readonly [] = Object.freeze([]);
  return Object.freeze({
    result: Object.freeze({
      ok: true,
      value,
      warnings,
    }),
    evidence: Object.freeze({
      contractSchema: DOCUMENT_VALIDATION_CONTRACT_SCHEMA,
      policyId: DOCUMENT_SEMANTICS_POLICY_ID,
      policyVersion: DOCUMENT_SEMANTICS_POLICY_VERSION,
      termination: "complete-success",
      counters: freezeCounters(state.counters),
    }),
  });
}

export const validateDocumentSemantics: ValidateDocumentSemantics = (
  candidate,
) => validateDocumentSemanticsWithEvidence(candidate).result;

export const documentValidationOperations = Object.freeze({
  validateDocumentSemantics,
});
