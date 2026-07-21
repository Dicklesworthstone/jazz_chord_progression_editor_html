import type {
  ChordEvent,
  ProgressionDocumentV2,
} from "../domain";
import {
  type AppState,
  type ApplicationRefusalCode,
  type DerivedDocumentPatch,
  type DocumentCommand,
  type PendingApplicationRequest,
} from "./application-state-contract";
import {
  deepStructuralEqual,
  runtimeField,
} from "./application-state-helpers";

type PatchCheckResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      code: ApplicationRefusalCode;
      path: readonly (string | number)[];
    }>;

type NodeDescriptor = Readonly<{
  kind: "section" | "measure" | "event";
  id: string;
  parentId: string;
  index: number;
  own: unknown;
}>;

function duplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function descriptors(document: ProgressionDocumentV2): Map<string, NodeDescriptor> {
  const result = new Map<string, NodeDescriptor>();
  for (
    let sectionIndex = 0;
    sectionIndex < document.sections.length;
    sectionIndex += 1
  ) {
    const section = document.sections[sectionIndex];
    if (section === undefined) continue;
    result.set(section.id, {
      kind: "section",
      id: section.id,
      parentId: document.id,
      index: sectionIndex,
      own: {
        id: section.id,
        name: section.name,
        annotation: section.annotation,
        keyOverride: section.keyOverride,
        voiceLeadingBoundary: section.voiceLeadingBoundary,
      },
    });
    for (
      let measureIndex = 0;
      measureIndex < section.measures.length;
      measureIndex += 1
    ) {
      const measure = section.measures[measureIndex];
      if (measure === undefined) continue;
      result.set(measure.id, {
        kind: "measure",
        id: measure.id,
        parentId: section.id,
        index: measureIndex,
        own: { id: measure.id, completion: measure.completion },
      });
      for (
        let eventIndex = 0;
        eventIndex < measure.events.length;
        eventIndex += 1
      ) {
        const event = measure.events[eventIndex];
        if (event === undefined) continue;
        result.set(event.id, {
          kind: "event",
          id: event.id,
          parentId: measure.id,
          index: eventIndex,
          own: event,
        });
      }
    }
  }
  return result;
}

function documentOwn(document: ProgressionDocumentV2): unknown {
  return {
    schema: document.schema,
    id: document.id,
    title: document.title,
    description: document.description,
    meter: document.meter,
    tempoBpm: document.tempoBpm,
    key: document.key,
    playback: document.playback,
  };
}

function changedIds(
  before: ProgressionDocumentV2,
  after: ProgressionDocumentV2,
): Set<string> {
  const changed = new Set<string>();
  if (!deepStructuralEqual(documentOwn(before), documentOwn(after))) {
    changed.add(before.id);
    if (before.id !== after.id) changed.add(after.id);
  }
  const beforeNodes = descriptors(before);
  const afterNodes = descriptors(after);
  const ids = new Set([...beforeNodes.keys(), ...afterNodes.keys()]);
  for (const id of ids) {
    const left = beforeNodes.get(id);
    const right = afterNodes.get(id);
    if (left === undefined || right === undefined || !deepStructuralEqual(left, right)) {
      changed.add(id);
    }
  }
  return changed;
}

function eventTimeline(document: ProgressionDocumentV2): readonly ChordEvent[] {
  return document.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events),
  );
}

function exactTimingPreserved(
  before: ProgressionDocumentV2,
  after: ProgressionDocumentV2,
): boolean {
  if (!deepStructuralEqual(before.meter, after.meter)) return false;
  if (before.sections.length !== after.sections.length) return false;
  for (let sectionIndex = 0; sectionIndex < before.sections.length; sectionIndex += 1) {
    const leftSection = before.sections[sectionIndex];
    const rightSection = after.sections[sectionIndex];
    if (
      leftSection === undefined ||
      rightSection === undefined ||
      leftSection.id !== rightSection.id ||
      leftSection.measures.length !== rightSection.measures.length
    ) {
      return false;
    }
    for (
      let measureIndex = 0;
      measureIndex < leftSection.measures.length;
      measureIndex += 1
    ) {
      const leftMeasure = leftSection.measures[measureIndex];
      const rightMeasure = rightSection.measures[measureIndex];
      if (
        leftMeasure === undefined ||
        rightMeasure === undefined ||
        leftMeasure.id !== rightMeasure.id ||
        !deepStructuralEqual(leftMeasure.completion, rightMeasure.completion)
      ) {
        return false;
      }
    }
  }
  const beforeEvents = eventTimeline(before);
  const afterEvents = eventTimeline(after);
  return (
    beforeEvents.length === afterEvents.length &&
    beforeEvents.every((event, index) => {
      const next = afterEvents[index];
      return (
        next !== undefined &&
        event.id === next.id &&
        deepStructuralEqual(event.duration, next.duration)
      );
    })
  );
}

function currentRequest(
  state: AppState,
  kind: PendingApplicationRequest["kind"],
  requestId: number,
): boolean {
  return state.pendingRequests.some(
    (request) =>
      request.kind === kind &&
      request.id === requestId &&
      request.documentId === state.document.id &&
      request.baseRevision === state.revision,
  );
}

function validatePatch(
  state: AppState,
  patch: DerivedDocumentPatch,
): PatchCheckResult {
  if (
    runtimeField(patch, "stableIdentityPolicy") !==
    "preserve-unmodified-allocate-new-inserts"
  ) {
    return {
      ok: false,
      code: "command.derived_patch_scope_mismatch",
      path: ["patch", "stableIdentityPolicy"],
    };
  }
  if (patch.baseRevision !== state.revision) {
    return {
      ok: false,
      code: "command.derived_patch_stale",
      path: ["patch", "baseRevision"],
    };
  }
  if (patch.candidate.id !== state.document.id) {
    return {
      ok: false,
      code: "command.derived_patch_scope_mismatch",
      path: ["patch", "candidate", "id"],
    };
  }
  const sourceIds = patch.sourceEventIds.map(String);
  const declaredIds = patch.declaredChangedIds.map(String);
  if (duplicate(sourceIds) || duplicate(declaredIds)) {
    return {
      ok: false,
      code: "command.derived_patch_scope_mismatch",
      path: ["patch"],
    };
  }
  const beforeNodes = descriptors(state.document);
  if (sourceIds.some((id) => beforeNodes.get(id)?.kind !== "event")) {
    return {
      ok: false,
      code: "command.derived_patch_stale",
      path: ["patch", "sourceEventIds"],
    };
  }
  const actual = changedIds(state.document, patch.candidate);
  const declared = new Set(declaredIds);
  if (
    actual.size !== declared.size ||
    [...actual].some((id) => !declared.has(id))
  ) {
    return {
      ok: false,
      code: "command.derived_patch_scope_mismatch",
      path: ["patch", "declaredChangedIds"],
    };
  }
  if (actual.size === 0) {
    return {
      ok: false,
      code: "command.payload_invalid",
      path: ["patch", "candidate"],
    };
  }
  if (
    patch.exactTimingPreserved &&
    !exactTimingPreserved(state.document, patch.candidate)
  ) {
    return {
      ok: false,
      code: "command.derived_patch_scope_mismatch",
      path: ["patch", "exactTimingPreserved"],
    };
  }
  return { ok: true };
}

export function validateDerivedCommand(
  state: AppState,
  command: Extract<
    DocumentCommand,
    { kind: "transpose" | "apply-suggestion" | "apply-reharmonization" }
  >,
): PatchCheckResult {
  const patch = validatePatch(state, command.patch);
  if (!patch.ok) return patch;
  if (
    command.kind === "apply-suggestion" &&
    !currentRequest(state, "suggestion-search", command.requestId)
  ) {
    return {
      ok: false,
      code: "command.derived_patch_stale",
      path: ["requestId"],
    };
  }
  if (
    command.kind === "apply-reharmonization" &&
    !currentRequest(state, "reharmonization-search", command.requestId)
  ) {
    return {
      ok: false,
      code: "command.derived_patch_stale",
      path: ["requestId"],
    };
  }
  return { ok: true };
}
