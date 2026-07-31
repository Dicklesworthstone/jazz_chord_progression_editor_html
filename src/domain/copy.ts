import type {
  AutoVoicing,
  ChordDegree,
  ChordEvent,
  ChordSpec,
  CustomChordSpec,
  DegreeNumber,
  FrozenVoicing,
  ManualVoicing,
  MidiRange,
  NonEmptySpelledPitches,
  Voicing,
} from "./chord";
import type { BeatDuration, Meter } from "./duration";
import type {
  Measure,
  MeasureCompletion,
  PlaybackSettings,
  ProgressionDocumentV2,
  Section,
} from "./document";
import type {
  CopyStableIdLocation,
  ExistingStableIdLocation,
  IdRemapRefusal,
  OccupiedStableIdLocation,
  StableIdFactory,
  StableIdFor,
  StableIdKind,
  StableIdRemapEntry,
  StableIdRemapTable,
} from "./ids";
import type { KeyContext } from "./key";
import type { SpelledPitch, SpelledPitchClass } from "./pitch";
import type { DomainPath, PathRefusal } from "./result";
import type { ValidatedDocument } from "./validated-document";

export const DOMAIN_COPY_ROOT_KINDS = [
  "document",
  "section",
  "measure",
  "event",
] as const;

/** 1 document + 64 sections + 64*1024 measures + 8192 events. */
export const MAX_DOMAIN_COPY_GRAPH_NODES = 73_793;

export type DomainCopyRootKind = (typeof DOMAIN_COPY_ROOT_KINDS)[number];

export type DomainCopyNodeLimitRefusal = PathRefusal<{
  code: "limit.copy_nodes_exceeded";
  received: number;
  maximum: typeof MAX_DOMAIN_COPY_GRAPH_NODES;
}>;

export type StableIdOccupancy<K extends StableIdKind = StableIdKind> =
  K extends StableIdKind
    ? Readonly<{
        id: StableIdFor<K>;
        location: ExistingStableIdLocation<K>;
      }>
    : never;

type DomainCopySourceByKind = Readonly<{
  document: ProgressionDocumentV2;
  section: Section;
  measure: Measure;
  event: ChordEvent;
}>;

type DomainCopyPurposeByKind = Readonly<{
  document: "duplicate" | "lesson-instantiation";
  section: "duplicate";
  measure: "duplicate";
  event: "duplicate";
}>;

type CopyRequestFields = Readonly<{
  /**
   * F1 derives occupied IDs from this bounded, published destination and from
   * the source graph; callers cannot supply an unbounded or decoupled ID list.
   */
  destination: ValidatedDocument | null;
  idFactory: StableIdFactory;
}>;

export type DomainCopyRequest<
  K extends DomainCopyRootKind = DomainCopyRootKind,
> = K extends DomainCopyRootKind
  ? CopyRequestFields &
      Readonly<{
        rootKind: K;
        purpose: DomainCopyPurposeByKind[K];
        source: DomainCopySourceByKind[K];
      }>
  : never;

export type DomainCopySuccess<
  K extends DomainCopyRootKind = DomainCopyRootKind,
> = K extends DomainCopyRootKind
  ? Readonly<{
      ok: true;
      rootKind: K;
      value: DomainCopySourceByKind[K];
      remap: StableIdRemapTable;
    }>
  : never;

/** Failure contains no copied value or partial remap. */
export type DomainCopyResult<
  K extends DomainCopyRootKind = DomainCopyRootKind,
> =
  | DomainCopySuccess<K>
  | Readonly<{
      ok: false;
      refusal: IdRemapRefusal | DomainCopyNodeLimitRefusal;
    }>;

export type DomainCopyOperation = <K extends DomainCopyRootKind>(
  request: DomainCopyRequest<K>,
) => DomainCopyResult<K>;

type DomainCopySource = DomainCopySourceByKind[DomainCopyRootKind];

type MutableDocumentCopy = Omit<ProgressionDocumentV2, "sections"> &
  Readonly<{ sections: MutableSectionCopy[] }>;
type MutableSectionCopy = Omit<Section, "measures"> &
  Readonly<{ measures: MutableMeasureCopy[] }>;
type MutableMeasureCopy = Readonly<{
  id: Measure["id"];
  events: ChordEvent[];
  completion: Measure["completion"];
}>;

type MutableCopyOutputByKind = Readonly<{
  document: MutableDocumentCopy;
  section: MutableSectionCopy;
  measure: MutableMeasureCopy;
  event: ChordEvent;
}>;
type MutableCopyOutput = MutableCopyOutputByKind[DomainCopyRootKind];

type CopyPlanEntryByKind<K extends DomainCopyRootKind> = {
  kind: K;
  from: StableIdFor<K>;
  to: StableIdFor<K>;
  sourcePath: DomainPath;
  /** Private construction metadata removed during the finalization pass. */
  source?: DomainCopySource;
  parentPlanIndex?: number;
  childIndex?: number;
  childCount?: number;
  output?: MutableCopyOutput;
};

type CopyPlanEntry<
  K extends DomainCopyRootKind = DomainCopyRootKind,
> = K extends DomainCopyRootKind ? CopyPlanEntryByKind<K> : never;

type CollisionIndexRecord =
  | Readonly<{
      scope: "existing";
      location: ExistingStableIdLocation;
    }>
  | Readonly<{
      scope: "allocated";
      location: CopyStableIdLocation;
    }>;

type CollisionIndex = Map<string, CollisionIndexRecord>;

type PlanBuilder = {
  readonly plan: CopyPlanEntry[];
  readonly collisionIndex: CollisionIndex;
  nextIndex: number;
  overflow: boolean;
};

function incrementNodeCount(count: number): number {
  return count >= MAX_DOMAIN_COPY_GRAPH_NODES
    ? MAX_DOMAIN_COPY_GRAPH_NODES + 1
    : count + 1;
}

function countEvent(): number {
  return 1;
}

function countMeasure(measure: Measure): number {
  let count = 1;
  const events = measure.events;
  for (const event of events) {
    void event;
    count = incrementNodeCount(count);
    if (count > MAX_DOMAIN_COPY_GRAPH_NODES) return count;
  }
  return count;
}

function countSection(section: Section): number {
  let count = 1;
  const measures = section.measures;
  for (const measure of measures) {
    count = incrementNodeCount(count);
    if (count > MAX_DOMAIN_COPY_GRAPH_NODES) return count;
    const events = measure.events;
    for (const event of events) {
      void event;
      count = incrementNodeCount(count);
      if (count > MAX_DOMAIN_COPY_GRAPH_NODES) return count;
    }
  }
  return count;
}

function countDocument(document: ProgressionDocumentV2): number {
  let count = 1;
  const sections = document.sections;
  for (const section of sections) {
    count = incrementNodeCount(count);
    if (count > MAX_DOMAIN_COPY_GRAPH_NODES) return count;
    const measures = section.measures;
    for (const measure of measures) {
      count = incrementNodeCount(count);
      if (count > MAX_DOMAIN_COPY_GRAPH_NODES) return count;
      const events = measure.events;
      for (const event of events) {
        void event;
        count = incrementNodeCount(count);
        if (count > MAX_DOMAIN_COPY_GRAPH_NODES) return count;
      }
    }
  }
  return count;
}

function countRequestSource(request: DomainCopyRequest): number {
  switch (request.rootKind) {
    case "document": return countDocument(request.source);
    case "section": return countSection(request.source);
    case "measure": return countMeasure(request.source);
    case "event": return countEvent();
  }
}

function occupiedLocation<K extends DomainCopyRootKind>(
  kind: K,
  path: DomainPath,
): OccupiedStableIdLocation<K> {
  return {
    kind,
    path,
    pathRoot: "occupied-document",
  } as OccupiedStableIdLocation<K>;
}

function sourceLocation<K extends DomainCopyRootKind>(
  kind: K,
  path: DomainPath,
): CopyStableIdLocation<K> {
  return {
    kind,
    path,
    pathRoot: "copy-root",
  } as CopyStableIdLocation<K>;
}

function copyLocation<K extends DomainCopyRootKind>(
  entry: CopyPlanEntryByKind<K>,
): CopyStableIdLocation<K> {
  return {
    kind: entry.kind,
    path: entry.sourcePath,
    pathRoot: "copy-root",
  } as CopyStableIdLocation<K>;
}

function incompleteRemap<K extends DomainCopyRootKind>(
  entry: CopyPlanEntryByKind<K>,
): Readonly<{ ok: false; refusal: IdRemapRefusal }> {
  return {
    ok: false,
    refusal: {
      code: "id.remap_incomplete",
      kind: entry.kind,
      source: entry.from,
      path: entry.sourcePath,
    } as IdRemapRefusal,
  };
}

function rootIncompleteRemap(request: DomainCopyRequest): IdRemapRefusal {
  switch (request.rootKind) {
    case "document":
      return {
        code: "id.remap_incomplete",
        kind: "document",
        source: request.source.id,
        path: ["id"],
      };
    case "section":
      return {
        code: "id.remap_incomplete",
        kind: "section",
        source: request.source.id,
        path: ["id"],
      };
    case "measure":
      return {
        code: "id.remap_incomplete",
        kind: "measure",
        source: request.source.id,
        path: ["id"],
      };
    case "event":
      return {
        code: "id.remap_incomplete",
        kind: "event",
        source: request.source.id,
        path: ["id"],
      };
  }
}

function indexOriginal<K extends DomainCopyRootKind>(
  collisionIndex: CollisionIndex,
  id: StableIdFor<K>,
  location: ExistingStableIdLocation<K>,
): void {
  if (!collisionIndex.has(id)) {
    collisionIndex.set(id, {
      scope: "existing",
      location,
    });
  }
}

function addPlanEntry<K extends DomainCopyRootKind>(
  builder: PlanBuilder,
  kind: K,
  source: DomainCopySourceByKind[K],
  id: StableIdFor<K>,
  sourcePath: DomainPath,
  childCount: number,
  parentPlanIndex?: number,
  childIndex?: number,
): number | undefined {
  if (builder.nextIndex >= builder.plan.length) {
    builder.overflow = true;
    return undefined;
  }
  const planIndex = builder.nextIndex;
  const entry: CopyPlanEntryByKind<K> = {
    kind,
    from: id,
    // This private placeholder is overwritten during allocation and can never
    // escape: every failure discards the whole plan.
    to: id,
    sourcePath,
    source,
    childCount,
    ...(parentPlanIndex === undefined ? {} : { parentPlanIndex }),
    ...(childIndex === undefined ? {} : { childIndex }),
  };
  builder.plan[planIndex] = entry as CopyPlanEntry;
  builder.nextIndex += 1;
  indexOriginal(
    builder.collisionIndex,
    id,
    sourceLocation(kind, sourcePath),
  );
  return planIndex;
}

function emitEventPlan(
  builder: PlanBuilder,
  event: ChordEvent,
  prefix: DomainPath = [],
  parentPlanIndex?: number,
  childIndex?: number,
): void {
  addPlanEntry(
    builder,
    "event",
    event,
    event.id,
    [...prefix, "id"],
    0,
    parentPlanIndex,
    childIndex,
  );
}

function emitMeasurePlan(
  builder: PlanBuilder,
  measure: Measure,
  prefix: DomainPath = [],
  parentPlanIndex?: number,
  childIndex?: number,
): void {
  const events = measure.events;
  const planIndex = addPlanEntry(
    builder,
    "measure",
    measure,
    measure.id,
    [...prefix, "id"],
    events.length,
    parentPlanIndex,
    childIndex,
  );
  if (planIndex === undefined) return;
  for (const [eventIndex, event] of events.entries()) {
    emitEventPlan(
      builder,
      event,
      [...prefix, "events", eventIndex],
      planIndex,
      eventIndex,
    );
    if (builder.overflow) return;
  }
}

function emitSectionPlan(
  builder: PlanBuilder,
  section: Section,
  prefix: DomainPath = [],
  parentPlanIndex?: number,
  childIndex?: number,
): void {
  const measures = section.measures;
  const planIndex = addPlanEntry(
    builder,
    "section",
    section,
    section.id,
    [...prefix, "id"],
    measures.length,
    parentPlanIndex,
    childIndex,
  );
  if (planIndex === undefined) return;
  for (const [measureIndex, measure] of measures.entries()) {
    emitMeasurePlan(
      builder,
      measure,
      [...prefix, "measures", measureIndex],
      planIndex,
      measureIndex,
    );
    if (builder.overflow) return;
  }
}

function emitDocumentPlan(
  builder: PlanBuilder,
  document: ProgressionDocumentV2,
): void {
  const sections = document.sections;
  const planIndex = addPlanEntry(
    builder,
    "document",
    document,
    document.id,
    ["id"],
    sections.length,
  );
  if (planIndex === undefined) return;
  for (const [sectionIndex, section] of sections.entries()) {
    emitSectionPlan(
      builder,
      section,
      ["sections", sectionIndex],
      planIndex,
      sectionIndex,
    );
    if (builder.overflow) return;
  }
}

function emitRequestPlan(
  builder: PlanBuilder,
  request: DomainCopyRequest,
): void {
  switch (request.rootKind) {
    case "document": emitDocumentPlan(builder, request.source); return;
    case "section": emitSectionPlan(builder, request.source); return;
    case "measure": emitMeasurePlan(builder, request.source); return;
    case "event": emitEventPlan(builder, request.source); return;
  }
}

function indexDestination(
  destination: ValidatedDocument,
  collisionIndex: CollisionIndex,
): Readonly<{ ok: true }> | Readonly<{
  ok: false;
  refusal: DomainCopyNodeLimitRefusal;
}> {
  let count = 0;
  const visit = <K extends DomainCopyRootKind>(
    kind: K,
    id: StableIdFor<K>,
    path: DomainPath,
  ): boolean => {
    count = incrementNodeCount(count);
    if (count > MAX_DOMAIN_COPY_GRAPH_NODES) return false;
    indexOriginal(collisionIndex, id, occupiedLocation(kind, path));
    return true;
  };

  if (!visit("document", destination.id, ["id"])) {
    return nodeLimitRefusal("destination", count);
  }
  const sections = destination.sections;
  for (const [sectionIndex, section] of sections.entries()) {
    const sectionPrefix: DomainPath = ["sections", sectionIndex];
    if (!visit("section", section.id, [...sectionPrefix, "id"])) {
      return nodeLimitRefusal("destination", count);
    }
    const measures = section.measures;
    for (const [measureIndex, measure] of measures.entries()) {
      const measurePrefix: DomainPath = [
        ...sectionPrefix,
        "measures",
        measureIndex,
      ];
      if (!visit("measure", measure.id, [...measurePrefix, "id"])) {
        return nodeLimitRefusal("destination", count);
      }
      const events = measure.events;
      for (const [eventIndex, event] of events.entries()) {
        if (!visit("event", event.id, [
          ...measurePrefix,
          "events",
          eventIndex,
          "id",
        ])) return nodeLimitRefusal("destination", count);
      }
    }
  }
  return { ok: true };
}

function allocatePlanEntry<K extends DomainCopyRootKind>(
  entry: CopyPlanEntryByKind<K>,
  idFactory: StableIdFactory,
  collisionIndex: CollisionIndex,
): IdRemapRefusal | null {
  const candidate = idFactory.next(entry.kind);
  if (!candidate.ok) {
    return { ...candidate.refusal, path: entry.sourcePath };
  }
  const requested = copyLocation(entry);
  const collision = collisionIndex.get(candidate.value);
  if (collision?.scope === "existing") {
    return {
      code: "id.collision_existing",
      path: entry.sourcePath,
      requested,
      occupied: collision.location,
      collidingId: candidate.value,
    };
  }
  if (collision?.scope === "allocated") {
    return {
      code: "id.collision_allocated",
      path: entry.sourcePath,
      requested,
      firstAllocated: collision.location,
      collidingId: candidate.value,
    };
  }
  entry.to = candidate.value;
  collisionIndex.set(candidate.value, {
    scope: "allocated",
    location: requested,
  });
  return null;
}

function attachOutput(
  plan: readonly CopyPlanEntry[],
  entry: CopyPlanEntry,
): Readonly<{ ok: true }> | Readonly<{
  ok: false;
  refusal: IdRemapRefusal;
}> {
  if (entry.parentPlanIndex === undefined) return { ok: true };
  const parent = plan[entry.parentPlanIndex];
  const childIndex = entry.childIndex;
  if (
    parent === undefined ||
    parent.output === undefined ||
    entry.output === undefined ||
    childIndex === undefined
  ) return incompleteRemap(entry);

  if (parent.kind === "document" && entry.kind === "section") {
    const parentOutput = parent.output as MutableDocumentCopy;
    parentOutput.sections[childIndex] = entry.output as MutableSectionCopy;
    return { ok: true };
  }
  if (parent.kind === "section" && entry.kind === "measure") {
    const parentOutput = parent.output as MutableSectionCopy;
    parentOutput.measures[childIndex] = entry.output as MutableMeasureCopy;
    return { ok: true };
  }
  if (parent.kind === "measure" && entry.kind === "event") {
    const parentOutput = parent.output as MutableMeasureCopy;
    parentOutput.events[childIndex] = entry.output as ChordEvent;
    return { ok: true };
  }
  return incompleteRemap(entry);
}

function cloneSpelledPitchClass(
  source: SpelledPitchClass,
): SpelledPitchClass {
  return Object.freeze({ step: source.step, alter: source.alter });
}

function cloneSpelledPitch(source: SpelledPitch): SpelledPitch {
  return Object.freeze({
    step: source.step,
    alter: source.alter,
    octave: source.octave,
  });
}

function cloneBeatDuration(source: BeatDuration): BeatDuration {
  return Object.freeze({
    numerator: source.numerator,
    denominator: source.denominator,
  }) as BeatDuration;
}

function cloneMeter(source: Meter): Meter {
  return Object.freeze({
    beatsPerBar: source.beatsPerBar,
    beatUnit: source.beatUnit,
  });
}

function cloneKeyContext(source: KeyContext | null): KeyContext | null {
  if (source === null) return null;
  return Object.freeze({
    tonic: cloneSpelledPitchClass(source.tonic),
    mode: source.mode,
  });
}

function clonePlaybackSettings(source: PlaybackSettings): PlaybackSettings {
  return Object.freeze(
    source.grooveStyleId === undefined
      ? {
          instrumentId: source.instrumentId,
          masterVolume: source.masterVolume,
          reverbAmount: source.reverbAmount,
          countInBars: source.countInBars,
        }
      : {
          instrumentId: source.instrumentId,
          masterVolume: source.masterVolume,
          reverbAmount: source.reverbAmount,
          countInBars: source.countInBars,
          grooveStyleId: source.grooveStyleId,
        },
  );
}

function cloneMeasureCompletion(
  source: MeasureCompletion,
): MeasureCompletion {
  if (source.kind === "empty" || source.kind === "complete") {
    return Object.freeze({ kind: source.kind });
  }
  return Object.freeze({
    kind: source.kind,
    expectedDuration: cloneBeatDuration(source.expectedDuration),
    reason: source.reason,
  });
}

function cloneChordDegree<N extends DegreeNumber>(
  source: ChordDegree<N>,
): ChordDegree<N> {
  return Object.freeze({ number: source.number, alter: source.alter });
}

function cloneChordDegrees(
  source: readonly ChordDegree[],
): readonly ChordDegree[] {
  return Object.freeze(source.map((degree) => cloneChordDegree(degree)));
}

function cloneDegreeNumbers(
  source: readonly DegreeNumber[],
): readonly DegreeNumber[] {
  return Object.freeze([...source]);
}

function clonePitchClasses(
  source: CustomChordSpec["pitchNames"],
): CustomChordSpec["pitchNames"] {
  const copied: [SpelledPitchClass, ...SpelledPitchClass[]] = [
    cloneSpelledPitchClass(source[0]),
    ...source.slice(1).map((pitch) => cloneSpelledPitchClass(pitch)),
  ];
  return Object.freeze(copied);
}

function clonePitches(source: NonEmptySpelledPitches): NonEmptySpelledPitches {
  const copied: [SpelledPitch, ...SpelledPitch[]] = [
    cloneSpelledPitch(source[0]),
    ...source.slice(1).map((pitch) => cloneSpelledPitch(pitch)),
  ];
  return Object.freeze(copied);
}

function cloneChord(source: ChordSpec | CustomChordSpec): ChordSpec | CustomChordSpec {
  if (source.kind === "custom") {
    return Object.freeze({
      kind: source.kind,
      sourceText: source.sourceText,
      label: source.label,
      pitchNames: clonePitchClasses(source.pitchNames),
      bass: source.bass === null ? null : cloneSpelledPitchClass(source.bass),
    });
  }
  return Object.freeze({
    kind: source.kind,
    sourceText: source.sourceText,
    root: cloneSpelledPitchClass(source.root),
    triad: source.triad,
    sixth: source.sixth === null ? null : cloneChordDegree(source.sixth),
    seventh: source.seventh,
    extensions: cloneChordDegrees(source.extensions),
    additions: cloneChordDegrees(source.additions),
    alterations: cloneChordDegrees(source.alterations),
    omissions: cloneDegreeNumbers(source.omissions),
    bass: source.bass === null ? null : cloneSpelledPitchClass(source.bass),
    colorPolicy: source.colorPolicy,
  });
}

function cloneMidiRange(source: MidiRange): MidiRange {
  return Object.freeze({
    lowMidi: source.lowMidi,
    highMidi: source.highMidi,
  });
}

function cloneAutoVoicing(source: AutoVoicing): AutoVoicing {
  return Object.freeze({ ...source, range: cloneMidiRange(source.range) });
}

function cloneManualVoicing(source: ManualVoicing): ManualVoicing {
  return Object.freeze({ ...source, pitches: clonePitches(source.pitches) });
}

function cloneFrozenVoicing(source: FrozenVoicing): FrozenVoicing {
  return Object.freeze({
    ...source,
    pitches: clonePitches(source.pitches),
    generatedBy: Object.freeze({
      engineVersion: source.generatedBy.engineVersion,
      family: source.generatedBy.family,
    }),
  });
}

function cloneVoicing(source: Voicing): Voicing {
  switch (source.mode) {
    case "auto": return cloneAutoVoicing(source);
    case "manual": return cloneManualVoicing(source);
    case "frozen": return cloneFrozenVoicing(source);
  }
}

function cloneChordEvent(
  source: ChordEvent,
  id: ChordEvent["id"],
): ChordEvent {
  return {
    id,
    duration: cloneBeatDuration(source.duration),
    annotation: source.annotation,
    chord: cloneChord(source.chord),
    voicing: cloneVoicing(source.voicing),
  } as ChordEvent;
}

function constructPlanEntry(
  plan: readonly CopyPlanEntry[],
  entry: CopyPlanEntry,
): Readonly<{ ok: true }> | Readonly<{
  ok: false;
  refusal: IdRemapRefusal;
}> {
  const childCount = entry.childCount;
  if (entry.source === undefined || childCount === undefined) {
    return incompleteRemap(entry);
  }
  switch (entry.kind) {
    case "document": {
      const source = entry.source as ProgressionDocumentV2;
      entry.output = {
        schema: source.schema,
        id: entry.to,
        title: source.title,
        description: source.description,
        meter: cloneMeter(source.meter),
        tempoBpm: source.tempoBpm,
        key: cloneKeyContext(source.key),
        sections: new Array<MutableSectionCopy>(childCount),
        playback: clonePlaybackSettings(source.playback),
      };
      break;
    }
    case "section": {
      const source = entry.source as Section;
      entry.output = {
        id: entry.to,
        name: source.name,
        annotation: source.annotation,
        keyOverride: cloneKeyContext(source.keyOverride),
        voiceLeadingBoundary: source.voiceLeadingBoundary,
        measures: new Array<MutableMeasureCopy>(childCount),
      };
      break;
    }
    case "measure": {
      const source = entry.source as Measure;
      entry.output = {
        id: entry.to,
        events: new Array<ChordEvent>(childCount),
        completion: cloneMeasureCompletion(source.completion),
      };
      break;
    }
    case "event": {
      const source = entry.source as ChordEvent;
      entry.output = cloneChordEvent(source, entry.to);
      break;
    }
  }
  return attachOutput(plan, entry);
}

function arrayIsComplete(values: readonly unknown[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.hasOwn(values, index)) return false;
  }
  return true;
}

function freezeOutput(entry: CopyPlanEntry): IdRemapRefusal | null {
  if (entry.output === undefined) return incompleteRemap(entry).refusal;
  switch (entry.kind) {
    case "document": {
      const output = entry.output as MutableDocumentCopy;
      if (!arrayIsComplete(output.sections)) {
        return incompleteRemap(entry).refusal;
      }
      Object.freeze(output.sections);
      Object.freeze(output);
      return null;
    }
    case "section": {
      const output = entry.output as MutableSectionCopy;
      if (!arrayIsComplete(output.measures)) {
        return incompleteRemap(entry).refusal;
      }
      Object.freeze(output.measures);
      Object.freeze(output);
      return null;
    }
    case "measure": {
      const output = entry.output as MutableMeasureCopy;
      if (!arrayIsComplete(output.events)) {
        return incompleteRemap(entry).refusal;
      }
      Object.freeze(output.events);
      Object.freeze(output);
      return null;
    }
    case "event": {
      const output = entry.output as ChordEvent;
      Object.freeze(output);
      return null;
    }
  }
}

function finalizePlan(
  plan: CopyPlanEntry[],
  request: DomainCopyRequest,
): Readonly<{
  ok: true;
  value: DomainCopySource;
  remap: StableIdRemapTable;
}> | Readonly<{
  ok: false;
  refusal: IdRemapRefusal;
}> {
  let rootOutput: DomainCopySource | undefined;
  for (let index = plan.length - 1; index >= 0; index -= 1) {
    const entry = plan[index];
    if (entry === undefined) continue;
    const freezeRefusal = freezeOutput(entry);
    if (freezeRefusal !== null) return { ok: false, refusal: freezeRefusal };
    if (entry.parentPlanIndex === undefined) {
      rootOutput = entry.output as DomainCopySource;
    }
    Object.freeze(entry.sourcePath);
    delete entry.source;
    delete entry.parentPlanIndex;
    delete entry.childIndex;
    delete entry.childCount;
    delete entry.output;
    Object.freeze(entry);
  }
  if (rootOutput === undefined) {
    return { ok: false, refusal: rootIncompleteRemap(request) };
  }
  const entries: readonly StableIdRemapEntry[] = Object.freeze(plan);
  return {
    ok: true,
    value: rootOutput,
    remap: Object.freeze({ entries }),
  };
}

function nodeLimitRefusal(
  path: "source" | "destination",
  received: number,
): Readonly<{ ok: false; refusal: DomainCopyNodeLimitRefusal }> {
  return {
    ok: false as const,
    refusal: {
      code: "limit.copy_nodes_exceeded" as const,
      path: [path],
      received,
      maximum: MAX_DOMAIN_COPY_GRAPH_NODES,
    },
  };
}

function copyDomainUnion(request: DomainCopyRequest): DomainCopyResult {
  const sourceCount = countRequestSource(request);
  if (sourceCount > MAX_DOMAIN_COPY_GRAPH_NODES) {
    return nodeLimitRefusal("source", sourceCount);
  }
  const collisionIndex: CollisionIndex = new Map();
  if (request.destination !== null) {
    const destinationResult = indexDestination(
      request.destination,
      collisionIndex,
    );
    if (!destinationResult.ok) return destinationResult;
  }

  // This exact-size array is both the private construction plan and the public
  // remap entry array. No second proportional remap list is allocated.
  const plan = new Array<CopyPlanEntry>(sourceCount);
  const builder: PlanBuilder = {
    plan,
    collisionIndex,
    nextIndex: 0,
    overflow: false,
  };
  emitRequestPlan(builder, request);
  if (builder.overflow) {
    return nodeLimitRefusal("source", MAX_DOMAIN_COPY_GRAPH_NODES + 1);
  }
  plan.length = builder.nextIndex;

  // Allocation pass: the entire remap is filled before any output node exists.
  for (const entry of plan) {
    const refusal = allocatePlanEntry(
      entry,
      request.idFactory,
      collisionIndex,
    );
    if (refusal !== null) return { ok: false, refusal };
  }

  // Construction pass: source graph relationships come only from plan metadata.
  for (const entry of plan) {
    const constructed = constructPlanEntry(plan, entry);
    if (!constructed.ok) return constructed;
  }

  // Finalization pass: freeze output and erase private metadata in place.
  const finalized = finalizePlan(plan, request);
  if (!finalized.ok) return finalized;
  return Object.freeze({
    ok: true,
    rootKind: request.rootKind,
    value: finalized.value,
    remap: finalized.remap,
  }) as DomainCopyResult;
}

/** Preflight, allocate, and construct one immutable copy without partial output. */
export const copyDomain: DomainCopyOperation = <K extends DomainCopyRootKind>(
  request: DomainCopyRequest<K>,
): DomainCopyResult<K> => {
  const result = copyDomainUnion(request) as DomainCopyResult<K>;
  if (!Object.isFrozen(result)) Object.freeze(result);
  return result;
};
