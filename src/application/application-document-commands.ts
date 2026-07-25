import type {
  ChordEvent,
  Measure,
  Section,
} from "../domain";
import {
  type AppState,
  type ApplicationCommandDependencies,
  type ApplicationRefusalCode,
  type DocumentCommand,
  type DocumentNodeRef,
  type MeasureCompletionUpdate,
} from "./application-state-contract";
import {
  asCandidate,
  deepStructuralEqual,
  findNode,
  type ApplicationDocumentCandidate,
  type CandidateMeasure,
  type CandidateSection,
  type DocumentIndex,
  type DocumentNodeLocation,
  type MutableApplicationWorkCounters,
} from "./application-state-helpers";

export type AppliedDocumentCommand = Readonly<{
  candidate: unknown;
  playbackRelevant: boolean;
  replacement: boolean;
  insertedRefs: readonly DocumentNodeRef[];
}>;

export type ApplyDocumentCommandResult =
  | Readonly<{ ok: true; value: AppliedDocumentCommand }>
  | Readonly<{
      ok: false;
      code: ApplicationRefusalCode;
      path: readonly (string | number)[];
    }>;

function rejected(
  code: ApplicationRefusalCode,
  ...path: readonly (string | number)[]
): ApplyDocumentCommandResult {
  return { ok: false, code, path };
}

function accepted(
  candidate: unknown,
  playbackRelevant: boolean,
  replacement = false,
  insertedRefs: readonly DocumentNodeRef[] = [],
): ApplyDocumentCommandResult {
  return {
    ok: true,
    value: {
      candidate,
      playbackRelevant,
      replacement,
      insertedRefs: Object.freeze([...insertedRefs]),
    },
  };
}

function insertBefore<T>(
  values: readonly T[],
  beforeIndex: number | null,
  inserted: readonly T[],
): readonly T[] {
  const index = beforeIndex ?? values.length;
  return Object.freeze([
    ...values.slice(0, index),
    ...inserted,
    ...values.slice(index),
  ]);
}

function withSections(
  candidate: ApplicationDocumentCandidate,
  sections: readonly CandidateSection[],
): ApplicationDocumentCandidate {
  return { ...candidate, sections: Object.freeze([...sections]) };
}

function updateSection(
  candidate: ApplicationDocumentCandidate,
  sectionId: string,
  update: (section: CandidateSection) => CandidateSection,
): ApplicationDocumentCandidate | null {
  if (!candidate.sections.some((section) => section.id === sectionId)) return null;
  const sections = candidate.sections.map((section) => {
    if (section.id !== sectionId) return section;
    return update(section);
  });
  return withSections(candidate, sections);
}

function updateMeasure(
  candidate: ApplicationDocumentCandidate,
  measureId: string,
  update: (measure: CandidateMeasure) => CandidateMeasure,
): ApplicationDocumentCandidate | null {
  if (
    !candidate.sections.some((section) =>
      section.measures.some((measure) => measure.id === measureId),
    )
  ) {
    return null;
  }
  const sections = candidate.sections.map((section) => {
    const measures = section.measures.map((measure) => {
      if (measure.id !== measureId) return measure;
      return update(measure);
    });
    return { ...section, measures: Object.freeze(measures) };
  });
  return withSections(candidate, sections);
}

function candidateStableIds(candidate: ApplicationDocumentCandidate): Set<string> {
  const ids = new Set<string>([candidate.id]);
  for (const section of candidate.sections) {
    ids.add(section.id);
    for (const measure of section.measures) {
      ids.add(measure.id);
      for (const event of measure.events) {
        if (
          typeof event === "object" &&
          event !== null &&
          "id" in event &&
          typeof event.id === "string"
        ) {
          ids.add(event.id);
        }
      }
    }
  }
  return ids;
}

function nodeStableIds(value: Section | Measure | ChordEvent): readonly string[] {
  if ("measures" in value) {
    return [
      value.id,
      ...value.measures.flatMap((measure) => nodeStableIds(measure)),
    ];
  }
  if ("events" in value) {
    return [value.id, ...value.events.map((event) => event.id)];
  }
  return [value.id];
}

function hasDuplicateStrings(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function completionUpdateMap(
  expectedIds: ReadonlySet<string>,
  updates: readonly MeasureCompletionUpdate[],
): ReadonlyMap<string, MeasureCompletionUpdate> | null {
  const map = new Map<string, MeasureCompletionUpdate>();
  for (const update of updates) {
    if (map.has(update.measureId)) return null;
    map.set(update.measureId, update);
  }
  if (map.size !== expectedIds.size) return null;
  for (const expectedId of expectedIds) {
    if (!map.has(expectedId)) return null;
  }
  return map;
}

function applyCompletionUpdates(
  candidate: ApplicationDocumentCandidate,
  expectedIds: ReadonlySet<string>,
  updates: readonly MeasureCompletionUpdate[],
): ApplicationDocumentCandidate | null {
  const map = completionUpdateMap(expectedIds, updates);
  if (map === null) return null;
  if (map.size === 0) return candidate;
  const seen = new Set<string>();
  const sections = candidate.sections.map((section) => ({
    ...section,
    measures: Object.freeze(
      section.measures.map((measure) => {
        const update = map.get(measure.id);
        if (update === undefined) return measure;
        seen.add(measure.id);
        return { ...measure, completion: update.completion };
      }),
    ),
  }));
  if (seen.size !== map.size) return null;
  return withSections(candidate, sections);
}

function targetLocations(
  targets: readonly DocumentNodeRef[],
  index: DocumentIndex,
): readonly DocumentNodeLocation[] | null {
  const identities = targets.map((target) => `${target.kind}:${target.id}`);
  if (hasDuplicateStrings(identities)) return null;
  const locations: DocumentNodeLocation[] = [];
  for (const target of targets) {
    const location = findNode(index, target.kind, target.id);
    if (location === null) return null;
    locations.push(location);
  }
  return locations;
}

function hasAncestorOverlap(locations: readonly DocumentNodeLocation[]): boolean {
  const sections = new Set(
    locations
      .filter((location) => location.kind === "section")
      .map((location) => location.id),
  );
  const measures = new Set(
    locations
      .filter((location) => location.kind === "measure")
      .map((location) => location.id),
  );
  return locations.some((location) => {
    if (location.kind === "measure") return sections.has(location.sectionId);
    if (location.kind === "event") {
      return sections.has(location.sectionId) || measures.has(location.measureId);
    }
    return false;
  });
}

function applyInsert(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "insert" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const candidate = asCandidate(state.document);
  const existing = candidateStableIds(candidate);
  const insertedIds = nodeStableIds(command.insertion.value);
  if (hasDuplicateStrings(insertedIds) || insertedIds.some((id) => existing.has(id))) {
    return rejected("command.payload_invalid", "insertion", "value", "id");
  }

  switch (command.insertion.nodeKind) {
    case "section": {
      if (command.insertion.completionUpdates.length !== 0) {
        return rejected("command.payload_invalid", "insertion", "completionUpdates");
      }
      const before = command.insertion.destination.beforeSectionId;
      const beforeIndex =
        before === null ? null : index.sections.get(before)?.sectionIndex;
      if (before !== null && beforeIndex === undefined) {
        return rejected("command.destination_invalid", "insertion", "destination");
      }
      return accepted(
        withSections(
          candidate,
          insertBefore(candidate.sections, beforeIndex ?? null, [command.insertion.value]),
        ),
        true,
        false,
        [{ kind: "section", id: command.insertion.value.id }],
      );
    }
    case "measure": {
      if (command.insertion.completionUpdates.length !== 0) {
        return rejected("command.payload_invalid", "insertion", "completionUpdates");
      }
      const destination = command.insertion.destination;
      const section = index.sections.get(destination.sectionId);
      if (section === undefined) {
        return rejected("command.destination_invalid", "insertion", "destination", "sectionId");
      }
      const beforeLocation =
        destination.beforeMeasureId === null
          ? null
          : index.measures.get(destination.beforeMeasureId);
      if (
        destination.beforeMeasureId !== null &&
        (beforeLocation == null || beforeLocation.sectionId !== destination.sectionId)
      ) {
        return rejected("command.destination_invalid", "insertion", "destination", "beforeMeasureId");
      }
      const value = command.insertion.value;
      const next = updateSection(candidate, section.id, (current) => ({
        ...current,
        measures: insertBefore(
          current.measures,
          beforeLocation?.measureIndex ?? null,
          [value],
        ),
      }));
      return next === null
        ? rejected("command.destination_invalid", "insertion", "destination")
        : accepted(next, true, false, [
            { kind: "measure", id: command.insertion.value.id },
          ]);
    }
    case "event": {
      const destination = command.insertion.destination;
      const measure = index.measures.get(destination.measureId);
      if (measure === undefined) {
        return rejected("command.destination_invalid", "insertion", "destination", "measureId");
      }
      const beforeLocation =
        destination.beforeEventId === null
          ? null
          : index.events.get(destination.beforeEventId);
      if (
        destination.beforeEventId !== null &&
        (beforeLocation == null || beforeLocation.measureId !== destination.measureId)
      ) {
        return rejected("command.destination_invalid", "insertion", "destination", "beforeEventId");
      }
      const inserted = updateMeasure(candidate, measure.id, (current) => ({
        ...current,
        events: insertBefore(
          current.events,
          beforeLocation?.eventIndex ?? null,
          [command.insertion.value],
        ),
      }));
      if (inserted === null) {
        return rejected("command.destination_invalid", "insertion", "destination");
      }
      const completed = applyCompletionUpdates(
        inserted,
        new Set([measure.id]),
        command.insertion.completionUpdates,
      );
      return completed === null
        ? rejected("command.payload_invalid", "insertion", "completionUpdates")
        : accepted(completed, true, false, [
            { kind: "event", id: command.insertion.value.id },
          ]);
    }
  }
}

function applyDelete(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "delete" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const locations = targetLocations(command.targets, index);
  if (locations === null) {
    const identities = command.targets.map((target) => `${target.kind}:${target.id}`);
    return rejected(
      hasDuplicateStrings(identities)
        ? "command.duplicate_target"
        : "command.target_missing",
      "targets",
    );
  }
  if (hasAncestorOverlap(locations)) {
    return rejected("command.ancestor_descendant_overlap", "targets");
  }
  const sectionIds = new Set(
    locations.filter((location) => location.kind === "section").map((location) => location.id),
  );
  const measureIds = new Set(
    locations.filter((location) => location.kind === "measure").map((location) => location.id),
  );
  const eventIds = new Set<string>(
    locations.filter((location) => location.kind === "event").map((location) => location.id),
  );
  const affectedMeasures = new Set<string>();
  for (const location of locations) {
    if (location.kind === "event") affectedMeasures.add(location.measureId);
  }
  const candidate = asCandidate(state.document);
  const sections = candidate.sections
    .filter((section) => !sectionIds.has(section.id))
    .map((section) => ({
      ...section,
      measures: Object.freeze(
        section.measures
          .filter((measure) => !measureIds.has(measure.id))
          .map((measure) => ({
            ...measure,
            events: Object.freeze(
              measure.events.filter((event) => {
                if (typeof event !== "object" || event === null || !("id" in event)) {
                  return true;
                }
                return !eventIds.has(String(event.id));
              }),
            ),
          })),
      ),
    }));
  const filtered = withSections(candidate, sections);
  const completed = applyCompletionUpdates(
    filtered,
    affectedMeasures,
    command.completionUpdates,
  );
  return completed === null
    ? rejected("command.payload_invalid", "completionUpdates")
    : accepted(completed, true);
}

function sameKindLocations(
  targets: readonly DocumentNodeRef[],
  index: DocumentIndex,
): readonly DocumentNodeLocation[] | null {
  const locations = targetLocations(targets, index);
  if (locations === null || locations.length === 0) return null;
  const kind = locations[0]?.kind;
  if (
    kind === undefined ||
    !locations.every((location) => location.kind === kind)
  ) {
    return null;
  }
  return [...locations].sort((left, right) => {
    if (left.sectionIndex !== right.sectionIndex) {
      return left.sectionIndex - right.sectionIndex;
    }
    const leftMeasureIndex = left.kind === "section" ? -1 : left.measureIndex;
    const rightMeasureIndex = right.kind === "section" ? -1 : right.measureIndex;
    if (leftMeasureIndex !== rightMeasureIndex) {
      return leftMeasureIndex - rightMeasureIndex;
    }
    const leftEventIndex = left.kind === "event" ? left.eventIndex : -1;
    const rightEventIndex = right.kind === "event" ? right.eventIndex : -1;
    return leftEventIndex - rightEventIndex;
  });
}

function sameKindTargetFailure(
  targets: readonly DocumentNodeRef[],
  index: DocumentIndex,
): ApplicationRefusalCode | null {
  if (targets.length === 0) return "command.payload_invalid";
  const identities = targets.map((target) => `${target.kind}:${target.id}`);
  if (hasDuplicateStrings(identities)) return "command.duplicate_target";
  const locations = targets.map((target) =>
    findNode(index, target.kind, target.id),
  );
  if (locations.some((location) => location === null)) {
    return "command.target_missing";
  }
  const firstKind = locations[0]?.kind;
  return firstKind !== undefined &&
    locations.every((location) => location?.kind === firstKind)
    ? null
    : "command.target_kind_mismatch";
}

function destinationInsideMovedSubtree(
  kind: DocumentNodeLocation["kind"],
  targetIds: ReadonlySet<string>,
  destination: Extract<DocumentCommand, { kind: "move" }>["destination"],
  index: DocumentIndex,
): boolean {
  if (kind === "section") {
    if (destination.kind === "measure") {
      return targetIds.has(destination.sectionId);
    }
    if (destination.kind === "event") {
      const measure = index.measures.get(destination.measureId);
      return measure !== undefined && targetIds.has(measure.sectionId);
    }
  }
  return (
    kind === "measure" &&
    destination.kind === "event" &&
    targetIds.has(destination.measureId)
  );
}

function applyMove(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "move" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const targetFailure = sameKindTargetFailure(command.targets, index);
  if (targetFailure !== null) return rejected(targetFailure, "targets");
  const locations = sameKindLocations(command.targets, index);
  if (locations === null) {
    return rejected("command.target_kind_mismatch", "targets");
  }
  const kind = locations[0]?.kind;
  const targetIds = new Set<string>(locations.map((location) => location.id));
  if (
    kind !== undefined &&
    destinationInsideMovedSubtree(kind, targetIds, command.destination, index)
  ) {
    return rejected("command.destination_invalid", "destination");
  }
  if (kind === undefined || command.destination.kind !== kind) {
    return rejected("command.target_kind_mismatch", "destination");
  }
  const candidate = asCandidate(state.document);
  let moved: ApplicationDocumentCandidate;
  const affectedMeasures = new Set<string>();

  if (kind === "section" && command.destination.kind === "section") {
    const before = command.destination.beforeSectionId;
    if (before !== null && targetIds.has(before)) {
      return rejected("command.destination_invalid", "destination", "beforeSectionId");
    }
    const source = candidate.sections.filter((section) => targetIds.has(section.id));
    const remaining = candidate.sections.filter((section) => !targetIds.has(section.id));
    const beforeIndex =
      before === null ? null : remaining.findIndex((section) => section.id === before);
    if (before !== null && beforeIndex === -1) {
      return rejected("command.destination_invalid", "destination", "beforeSectionId");
    }
    moved = withSections(candidate, insertBefore(remaining, beforeIndex, source));
  } else if (kind === "measure" && command.destination.kind === "measure") {
    const destinationSection = index.sections.get(command.destination.sectionId);
    if (destinationSection === undefined) {
      return rejected("command.destination_invalid", "destination", "sectionId");
    }
    const before = command.destination.beforeMeasureId;
    if (before !== null && targetIds.has(before)) {
      return rejected("command.destination_invalid", "destination", "beforeMeasureId");
    }
    const beforeLocation = before === null ? null : index.measures.get(before);
    if (
      before !== null &&
      (beforeLocation == null ||
        beforeLocation.sectionId !== destinationSection.id)
    ) {
      return rejected("command.destination_invalid", "destination", "beforeMeasureId");
    }
    const source = index.measureOrder
      .filter((id) => targetIds.has(id))
      .map((id) => index.measures.get(id)?.measure)
      .filter((measure): measure is Measure => measure !== undefined);
    const sections = candidate.sections.map((section) => {
      const remaining = section.measures.filter((measure) => !targetIds.has(measure.id));
      if (section.id !== destinationSection.id) {
        return { ...section, measures: Object.freeze(remaining) };
      }
      const beforeIndex =
        before === null
          ? null
          : remaining.findIndex((measure) => measure.id === before);
      return {
        ...section,
        measures: insertBefore(remaining, beforeIndex, source),
      };
    });
    moved = withSections(candidate, sections);
  } else if (kind === "event" && command.destination.kind === "event") {
    const destinationMeasure = index.measures.get(command.destination.measureId);
    if (destinationMeasure === undefined) {
      return rejected("command.destination_invalid", "destination", "measureId");
    }
    const before = command.destination.beforeEventId;
    if (before !== null && targetIds.has(before)) {
      return rejected("command.destination_invalid", "destination", "beforeEventId");
    }
    const beforeLocation = before === null ? null : index.events.get(before);
    if (
      before !== null &&
      (beforeLocation == null ||
        beforeLocation.measureId !== destinationMeasure.id)
    ) {
      return rejected("command.destination_invalid", "destination", "beforeEventId");
    }
    const source = index.eventOrder
      .filter((id) => targetIds.has(id))
      .map((id) => index.events.get(id)?.event)
      .filter((event): event is ChordEvent => event !== undefined);
    for (const location of locations) {
      if (location.kind === "event") affectedMeasures.add(location.measureId);
    }
    affectedMeasures.add(destinationMeasure.id);
    const sections = candidate.sections.map((section) => ({
      ...section,
      measures: Object.freeze(
        section.measures.map((measure) => {
          const remaining = measure.events.filter((event) => {
            if (typeof event !== "object" || event === null || !("id" in event)) {
              return true;
            }
            return !targetIds.has(String(event.id));
          });
          if (measure.id !== destinationMeasure.id) {
            return { ...measure, events: Object.freeze(remaining) };
          }
          const beforeIndex =
            before === null
              ? null
              : remaining.findIndex(
                  (event) =>
                    typeof event === "object" &&
                    event !== null &&
                    "id" in event &&
                    event.id === before,
                );
          return {
            ...measure,
            events: insertBefore(remaining, beforeIndex, source),
          };
        }),
      ),
    }));
    moved = withSections(candidate, sections);
  } else {
    return rejected("command.target_kind_mismatch", "destination");
  }

  if (deepStructuralEqual(candidate, moved)) {
    return rejected("command.payload_invalid", "destination");
  }
  const completed = applyCompletionUpdates(
    moved,
    affectedMeasures,
    command.completionUpdates,
  );
  return completed === null
    ? rejected("command.payload_invalid", "completionUpdates")
    : accepted(completed, true);
}

function copiedIdsAreAvailable(
  value: Section | Measure | ChordEvent,
  occupied: Set<string>,
): boolean {
  const ids = nodeStableIds(value);
  if (hasDuplicateStrings(ids) || ids.some((id) => occupied.has(id))) return false;
  for (const id of ids) occupied.add(id);
  return true;
}

function applyDuplicate(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "duplicate" }>,
  index: DocumentIndex,
  dependencies: ApplicationCommandDependencies,
): ApplyDocumentCommandResult {
  const targetFailure = sameKindTargetFailure(command.targets, index);
  if (targetFailure !== null) return rejected(targetFailure, "targets");
  const locations = sameKindLocations(command.targets, index);
  if (locations === null) {
    return rejected("command.target_kind_mismatch", "targets");
  }
  const kind = locations[0]?.kind;
  if (kind === undefined || command.destination.kind !== kind) {
    return rejected("command.target_kind_mismatch", "destination");
  }
  const occupied = candidateStableIds(asCandidate(state.document));
  const copies: (Section | Measure | ChordEvent)[] = [];
  for (const location of locations) {
    if (location.kind === "section") {
      const result = dependencies.copyDomain({
        rootKind: "section",
        purpose: "duplicate",
        source: location.section,
        destination: state.document,
        idFactory: dependencies.stableIdFactory,
      });
      if (!result.ok || !copiedIdsAreAvailable(result.value, occupied)) {
        return rejected("command.id_allocation_failed", "targets");
      }
      copies.push(result.value);
    } else if (location.kind === "measure") {
      const result = dependencies.copyDomain({
        rootKind: "measure",
        purpose: "duplicate",
        source: location.measure,
        destination: state.document,
        idFactory: dependencies.stableIdFactory,
      });
      if (!result.ok || !copiedIdsAreAvailable(result.value, occupied)) {
        return rejected("command.id_allocation_failed", "targets");
      }
      copies.push(result.value);
    } else {
      const result = dependencies.copyDomain({
        rootKind: "event",
        purpose: "duplicate",
        source: location.event,
        destination: state.document,
        idFactory: dependencies.stableIdFactory,
      });
      if (!result.ok || !copiedIdsAreAvailable(result.value, occupied)) {
        return rejected("command.id_allocation_failed", "targets");
      }
      copies.push(result.value);
    }
  }

  const candidate = asCandidate(state.document);
  let duplicated: ApplicationDocumentCandidate;
  const insertedRefs: DocumentNodeRef[] = [];
  const affectedMeasures = new Set<string>();
  if (kind === "section" && command.destination.kind === "section") {
    if (command.completionUpdates.length !== 0) {
      return rejected("command.payload_invalid", "completionUpdates");
    }
    const sections = copies.filter((value): value is Section => "measures" in value);
    const before = command.destination.beforeSectionId;
    const beforeIndex =
      before === null ? null : candidate.sections.findIndex((section) => section.id === before);
    if (before !== null && beforeIndex === -1) {
      return rejected("command.destination_invalid", "destination", "beforeSectionId");
    }
    duplicated = withSections(candidate, insertBefore(candidate.sections, beforeIndex, sections));
    insertedRefs.push(...sections.map((section) => ({ kind: "section" as const, id: section.id })));
  } else if (kind === "measure" && command.destination.kind === "measure") {
    if (command.completionUpdates.length !== 0) {
      return rejected("command.payload_invalid", "completionUpdates");
    }
    const measures = copies.filter((value): value is Measure => "events" in value);
    const destination = index.sections.get(command.destination.sectionId);
    if (destination === undefined) {
      return rejected("command.destination_invalid", "destination", "sectionId");
    }
    const before = command.destination.beforeMeasureId;
    const beforeLocation = before === null ? null : index.measures.get(before);
    if (
      before !== null &&
      (beforeLocation == null || beforeLocation.sectionId !== destination.id)
    ) {
      return rejected("command.destination_invalid", "destination", "beforeMeasureId");
    }
    const next = updateSection(candidate, destination.id, (section) => ({
      ...section,
      measures: insertBefore(
        section.measures,
        beforeLocation?.measureIndex ?? null,
        measures,
      ),
    }));
    if (next === null) return rejected("command.destination_invalid", "destination");
    duplicated = next;
    insertedRefs.push(...measures.map((measure) => ({ kind: "measure" as const, id: measure.id })));
  } else if (kind === "event" && command.destination.kind === "event") {
    const events = copies.filter(
      (value): value is ChordEvent => !("events" in value) && !("measures" in value),
    );
    const destination = index.measures.get(command.destination.measureId);
    if (destination === undefined) {
      return rejected("command.destination_invalid", "destination", "measureId");
    }
    const before = command.destination.beforeEventId;
    const beforeLocation = before === null ? null : index.events.get(before);
    if (
      before !== null &&
      (beforeLocation == null || beforeLocation.measureId !== destination.id)
    ) {
      return rejected("command.destination_invalid", "destination", "beforeEventId");
    }
    const next = updateMeasure(candidate, destination.id, (measure) => ({
      ...measure,
      events: insertBefore(
        measure.events,
        beforeLocation?.eventIndex ?? null,
        events,
      ),
    }));
    if (next === null) return rejected("command.destination_invalid", "destination");
    affectedMeasures.add(destination.id);
    const completed = applyCompletionUpdates(
      next,
      affectedMeasures,
      command.completionUpdates,
    );
    if (completed === null) {
      return rejected("command.payload_invalid", "completionUpdates");
    }
    duplicated = completed;
    insertedRefs.push(...events.map((event) => ({ kind: "event" as const, id: event.id })));
  } else {
    return rejected("command.target_kind_mismatch", "destination");
  }
  return accepted(duplicated, true, false, insertedRefs);
}

function applySetText(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "set-text" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const candidate = asCandidate(state.document);
  switch (command.target.kind) {
    case "document-title":
      return state.document.title === command.value
        ? rejected("command.payload_invalid", "value")
        : accepted({ ...candidate, title: command.value }, false);
    case "document-description":
      return state.document.description === command.value
        ? rejected("command.payload_invalid", "value")
        : accepted({ ...candidate, description: command.value }, false);
    case "section-name":
    case "section-annotation": {
      const location = index.sections.get(command.target.sectionId);
      if (location === undefined) return rejected("command.target_missing", "target", "sectionId");
      const field = command.target.kind === "section-name" ? "name" : "annotation";
      if (location.section[field] === command.value) {
        return rejected("command.payload_invalid", "value");
      }
      const next = updateSection(candidate, location.id, (section) => ({
        ...section,
        [field]: command.value,
      }));
      return next === null
        ? rejected("command.target_missing", "target", "sectionId")
        : accepted(next, false);
    }
    case "event-annotation": {
      const location = index.events.get(command.target.eventId);
      if (location === undefined) return rejected("command.target_missing", "target", "eventId");
      if (location.event.annotation === command.value) {
        return rejected("command.payload_invalid", "value");
      }
      const next = updateMeasure(candidate, location.measureId, (measure) => ({
        ...measure,
        events: Object.freeze(
          measure.events.map((event) => {
            if (
              typeof event === "object" &&
              event !== null &&
              "id" in event &&
              event.id === location.id
            ) {
              return { ...event, annotation: command.value };
            }
            return event;
          }),
        ),
      }));
      return next === null
        ? rejected("command.target_missing", "target", "eventId")
        : accepted(next, false);
    }
  }
}

function applySetDuration(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "set-duration" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const location = index.events.get(command.eventId);
  if (location === undefined) return rejected("command.target_missing", "eventId");
  if (command.completionUpdate.measureId !== location.measureId) {
    return rejected("command.payload_invalid", "completionUpdate", "measureId");
  }
  if (
    deepStructuralEqual(location.event.duration, command.duration) &&
    deepStructuralEqual(
      index.measures.get(location.measureId)?.measure.completion,
      command.completionUpdate.completion,
    )
  ) {
    return rejected("command.payload_invalid", "duration");
  }
  const candidate = asCandidate(state.document);
  const next = updateMeasure(candidate, location.measureId, (measure) => ({
    ...measure,
    completion: command.completionUpdate.completion,
    events: Object.freeze(
      measure.events.map((event) => {
        if (
          typeof event === "object" &&
          event !== null &&
          "id" in event &&
          event.id === location.id
        ) {
          return { ...event, duration: command.duration };
        }
        return event;
      }),
    ),
  }));
  return next === null
    ? rejected("command.target_missing", "eventId")
    : accepted(next, true);
}

function applySetMeasureCompletion(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "set-measure-completion" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const location = index.measures.get(command.measureId);
  if (location === undefined) return rejected("command.target_missing", "measureId");
  if (deepStructuralEqual(location.measure.completion, command.completion)) {
    return rejected("command.payload_invalid", "completion");
  }
  const next = updateMeasure(asCandidate(state.document), location.id, (measure) => ({
    ...measure,
    completion: command.completion,
  }));
  return next === null
    ? rejected("command.target_missing", "measureId")
    : accepted(next, true);
}

function applySetSection(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "set-section" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const location = index.sections.get(command.sectionId);
  if (location === undefined) return rejected("command.target_missing", "sectionId");
  if (Object.keys(command.patch).length === 0) {
    return rejected("command.payload_invalid", "patch");
  }
  const nextSection = { ...location.section, ...command.patch };
  if (deepStructuralEqual(location.section, nextSection)) {
    return rejected("command.payload_invalid", "patch");
  }
  const next = updateSection(asCandidate(state.document), location.id, () => ({
    ...nextSection,
    measures: location.section.measures,
  }));
  const playbackRelevant =
    command.patch.keyOverride !== undefined ||
    command.patch.voiceLeadingBoundary !== undefined;
  return next === null
    ? rejected("command.target_missing", "sectionId")
    : accepted(next, playbackRelevant);
}

function applySetChord(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "set-chord" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const location = index.events.get(command.eventId);
  if (location === undefined) return rejected("command.target_missing", "eventId");
  if (
    command.replacement.id !== location.id ||
    !deepStructuralEqual(command.replacement.duration, location.event.duration) ||
    command.replacement.annotation !== location.event.annotation
  ) {
    return rejected("command.payload_invalid", "replacement");
  }
  if (deepStructuralEqual(command.replacement, location.event)) {
    return rejected("command.payload_invalid", "replacement");
  }
  const next = updateMeasure(asCandidate(state.document), location.measureId, (measure) => ({
    ...measure,
    events: Object.freeze(
      measure.events.map((event) =>
        typeof event === "object" &&
        event !== null &&
        "id" in event &&
        event.id === location.id
          ? command.replacement
          : event,
      ),
    ),
  }));
  return next === null
    ? rejected("command.target_missing", "eventId")
    : accepted(next, true);
}

function applySetVoicing(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "set-voicing" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  const location = index.events.get(command.eventId);
  if (location === undefined) return rejected("command.target_missing", "eventId");
  if (deepStructuralEqual(command.voicing, location.event.voicing)) {
    return rejected("command.payload_invalid", "voicing");
  }
  const next = updateMeasure(asCandidate(state.document), location.measureId, (measure) => ({
    ...measure,
    events: Object.freeze(
      measure.events.map((event) => {
        if (
          typeof event === "object" &&
          event !== null &&
          "id" in event &&
          event.id === location.id
        ) {
          return { ...event, voicing: command.voicing };
        }
        return event;
      }),
    ),
  }));
  return next === null
    ? rejected("command.target_missing", "eventId")
    : accepted(next, true);
}

function applySetDocumentSettings(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "set-document-settings" }>,
  index: DocumentIndex,
): ApplyDocumentCommandResult {
  if (Object.keys(command.patch).length === 0) {
    return rejected("command.payload_invalid", "patch");
  }
  const candidate = { ...asCandidate(state.document), ...command.patch };
  if (deepStructuralEqual(asCandidate(state.document), candidate)) {
    return rejected("command.payload_invalid", "patch");
  }
  const meterChanged =
    command.patch.meter !== undefined &&
    !deepStructuralEqual(command.patch.meter, state.document.meter);
  const expected = meterChanged
    ? new Set(index.measureOrder as readonly string[])
    : new Set<string>();
  const completed = applyCompletionUpdates(
    candidate,
    expected,
    command.completionUpdates,
  );
  if (completed === null) {
    return rejected("command.payload_invalid", "completionUpdates");
  }
  const playbackRelevant =
    command.patch.meter !== undefined ||
    command.patch.tempoBpm !== undefined ||
    command.patch.key !== undefined ||
    command.patch.playback !== undefined;
  return accepted(completed, playbackRelevant);
}

/** The sixteenth `apply-edit-plan` kind is dispatched to its own runner
 * before this stage and never reaches the fifteen historical paths. */
export function applyDocumentCommand(
  state: AppState,
  command: Exclude<DocumentCommand, { kind: "apply-edit-plan" }>,
  index: DocumentIndex,
  counters: MutableApplicationWorkCounters,
  dependencies: ApplicationCommandDependencies,
): ApplyDocumentCommandResult {
  void counters;
  switch (command.kind) {
    case "insert":
      return applyInsert(state, command, index);
    case "delete":
      return applyDelete(state, command, index);
    case "move":
      return applyMove(state, command, index);
    case "duplicate":
      return applyDuplicate(state, command, index, dependencies);
    case "set-text":
      return applySetText(state, command, index);
    case "set-duration":
      return applySetDuration(state, command, index);
    case "set-measure-completion":
      return applySetMeasureCompletion(state, command, index);
    case "set-section":
      return applySetSection(state, command, index);
    case "set-chord":
      return applySetChord(state, command, index);
    case "set-voicing":
      return applySetVoicing(state, command, index);
    case "set-document-settings":
      return applySetDocumentSettings(state, command, index);
    case "transpose":
      return accepted(command.patch.candidate, true);
    case "apply-suggestion":
      return accepted(command.patch.candidate, true);
    case "apply-reharmonization":
      return accepted(command.patch.candidate, true);
    case "replace-document":
      return accepted(command.candidate, true, true);
  }
}
