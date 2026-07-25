import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  redoDocumentCommand,
  runDocumentCommand,
  undoDocumentCommand,
  validateDocumentSemantics,
  type AppState,
  type ApplicationCommandDependencies,
  type ApplicationTransitionResult,
  type DocumentCommand,
  type StableUiBookmarks,
} from "../../src/application";
import {
  makeBeatDuration,
  makeChordEvent,
  type ChordEvent,
  type MeasureCompletion,
  type ValidatedDocument,
} from "../../src/domain";
import sequenceFixture from
  "../fixtures/application-state/sequence-cases.json";
import {
  a0Dependencies,
  a0Envelope,
  a0GeneratedDocument,
  a0InitialState,
  a0StableId,
  a0StableIdFactory,
} from "./a0-application-fixture";
import {
  A0_REFERENCE_BEAT_DENOMINATOR,
  A0_REFERENCE_MAX_EVENTS,
  A0_REFERENCE_MEASURE_UNITS,
  a0ReferenceHistoryProjection,
  applyA0ReferenceAction,
  createA0ReferenceState,
  type A0ReferenceAction,
  type A0ReferenceDocument,
  type A0ReferenceState,
} from "./a0-reference-model";

const MASK_64 = (1n << 64n) - 1n;
const SPLITMIX_GAMMA = 0x9e3779b97f4a7c15n;

const ACTION_NAMES = Object.freeze([
  "insert-event",
  "delete-event",
  "move-event",
  "duplicate-event",
  "set-duration-valid",
  "set-text",
  "set-section",
  "set-voicing-valid",
  "undo",
  "redo",
] as const);

export type A0RandomizedActionName = (typeof ACTION_NAMES)[number];
type ActionName = A0RandomizedActionName;

const ACTION_WEIGHTS = Object.freeze({
  "insert-event": 128,
  "delete-event": 96,
  "move-event": 96,
  "duplicate-event": 64,
  "set-duration-valid": 128,
  "set-text": 160,
  "set-section": 96,
  "set-voicing-valid": 64,
  undo: 112,
  redo: 80,
} satisfies Readonly<Record<ActionName, number>>);

type StepObservation = Readonly<{
  action: A0ReferenceAction;
  outcome: string;
  revision: number;
  document: A0ReferenceDocument;
  bookmarks: unknown;
  history: unknown;
}>;

export type A0RandomizedProtocolRunRequest =
  | Readonly<{ kind: "authoritative" }>
  | Readonly<{
      kind: "profile-prefix";
      sequenceCount: number;
    }>;

export type A0RandomizedProtocolRunResult = Readonly<{
  sequenceHashes: readonly string[];
  actionCounts: Readonly<Record<ActionName, number>>;
  allActionKindsObserved: boolean;
}>;

export type A0RandomizedSequenceSuccessRow = Readonly<{
  ok: true;
  sequenceIndex: number;
  sequenceHash: string;
  actionCounts: Readonly<Record<ActionName, number>>;
}>;

export type A0RandomizedSequenceFailureRow = Readonly<{
  ok: false;
  sequenceIndex: number;
  message: string;
}>;

export type A0RandomizedSequenceRow =
  | A0RandomizedSequenceSuccessRow
  | A0RandomizedSequenceFailureRow;

export type A0RandomizedShardPacket = Readonly<{
  schema: "changes.evidence.a0-randomized-sequence-shard.v1";
  startInclusive: number;
  endExclusive: number;
  rows: readonly A0RandomizedSequenceRow[];
}>;

export type A0RandomizedOrderedShardOutcome = Readonly<{
  successes: readonly A0RandomizedSequenceSuccessRow[];
  failure: A0RandomizedSequenceFailureRow | null;
}>;

function mix64(input: bigint): bigint {
  let value = input & MASK_64;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
  return (value ^ (value >> 31n)) & MASK_64;
}

class SplitMix64 {
  #state: bigint;

  constructor(seed: bigint) {
    this.#state = seed & MASK_64;
  }

  next(): bigint {
    this.#state = (this.#state + SPLITMIX_GAMMA) & MASK_64;
    return mix64(this.#state);
  }

  index(length: number): number {
    if (!Number.isSafeInteger(length) || length <= 0) {
      throw new Error("A0_RANDOM_INVALID_INDEX_BOUND");
    }
    return Number(this.next() % BigInt(length));
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  code: string,
): void {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${code}\nexpected=${expectedJson}\nactual=${actualJson}`);
  }
}

function initialReferenceDocument(sequenceIndex: number): A0ReferenceDocument {
  return Object.freeze({
    title: `Random sequence ${String(sequenceIndex)}`,
    sectionName: `Section ${String(sequenceIndex)}`,
    events: Object.freeze(Array.from({ length: 4 }, (_, index) =>
      Object.freeze({
        id: `event-a0-random-${String(sequenceIndex)}-${String(index + 1)}`,
        durationUnits: 2 as const,
        voicingFamily: "balanced" as const,
      })
    )),
  });
}

function sequenceSeed(rootSeed: bigint, sequenceIndex: number): bigint {
  return mix64(rootSeed + BigInt(sequenceIndex));
}

function chooseActionName(rng: SplitMix64): ActionName {
  let bucket = Number(rng.next() & 1_023n);
  for (const name of ACTION_NAMES) {
    const weight = ACTION_WEIGHTS[name];
    if (bucket < weight) return name;
    bucket -= weight;
  }
  throw new Error("A0_RANDOM_WEIGHT_PARTITION");
}

function eventIdAt(state: A0ReferenceState, rng: SplitMix64): string {
  const event = state.document.events[rng.index(state.document.events.length)];
  if (event === undefined) throw new Error("A0_RANDOM_EVENT_MISSING");
  return event.id;
}

function generatedAction(
  state: A0ReferenceState,
  rng: SplitMix64,
  sequenceIndex: number,
  actionIndex: number,
): A0ReferenceAction {
  const name = chooseActionName(rng);
  const events = state.document.events;
  const token = `${String(sequenceIndex)}-${String(actionIndex)}`;
  const label = `${name}:${token}`;
  switch (name) {
    case "insert-event": {
      if (events.length >= A0_REFERENCE_MAX_EVENTS) {
        const occupied = events[0];
        if (occupied === undefined) throw new Error("A0_RANDOM_OCCUPIED_ID");
        return {
          kind: name,
          id: occupied.id,
          durationUnits: 1,
          beforeEventId: null,
          label,
        };
      }
      const beforeIndex = rng.index(events.length + 1);
      return {
        kind: name,
        id: `event-a0-random-insert-${token}`,
        durationUnits: rng.index(2) === 0 ? 1 : 2,
        beforeEventId: events[beforeIndex]?.id ?? null,
        label,
      };
    }
    case "delete-event": {
      if (events.length <= 1) {
        return { kind: name, eventId: `event-a0-missing-${token}`, label };
      }
      const protectedId = state.bookmarks.insertion.eventId;
      const candidates = events.filter(({ id }) => id !== protectedId);
      const target = candidates[rng.index(candidates.length)];
      if (target === undefined) throw new Error("A0_RANDOM_DELETE_TARGET");
      return { kind: name, eventId: target.id, label };
    }
    case "move-event": {
      if (events.length <= 1) {
        return {
          kind: name,
          eventId: `event-a0-missing-${token}`,
          beforeEventId: null,
          label,
        };
      }
      const sourceIndex = rng.index(events.length);
      const source = events[sourceIndex];
      const first = events[0];
      if (source === undefined || first === undefined) {
        throw new Error("A0_RANDOM_MOVE_TARGET");
      }
      return {
        kind: name,
        eventId: source.id,
        beforeEventId: sourceIndex === events.length - 1 ? first.id : null,
        label,
      };
    }
    case "duplicate-event": {
      const source = events[rng.index(events.length)];
      const first = events[0];
      if (source === undefined || first === undefined) {
        throw new Error("A0_RANDOM_DUPLICATE_TARGET");
      }
      return {
        kind: name,
        sourceEventId: source.id,
        copiedEventId: events.length >= A0_REFERENCE_MAX_EVENTS
          ? first.id
          : `event-a0-random-copy-${token}`,
        beforeEventId: null,
        label,
      };
    }
    case "set-duration-valid": {
      const eventId = eventIdAt(state, rng);
      const event = events.find(({ id }) => id === eventId);
      if (event === undefined) throw new Error("A0_RANDOM_DURATION_TARGET");
      return {
        kind: name,
        eventId,
        durationUnits: event.durationUnits === 1 ? 2 : 1,
        label,
      };
    }
    case "set-text":
      return { kind: name, value: `Title ${token}`, label };
    case "set-section":
      return { kind: name, value: `Section ${token}`, label };
    case "set-voicing-valid": {
      const eventId = eventIdAt(state, rng);
      const event = events.find(({ id }) => id === eventId);
      if (event === undefined) throw new Error("A0_RANDOM_VOICING_TARGET");
      return {
        kind: name,
        eventId,
        family: event.voicingFamily === "balanced" ? "open" : "balanced",
        label,
      };
    }
    case "undo":
    case "redo":
      return { kind: name };
  }
}

function generateActions(
  seed: bigint,
  sequenceIndex: number,
  count: number,
): readonly A0ReferenceAction[] {
  const rng = new SplitMix64(seed);
  let state = createA0ReferenceState(initialReferenceDocument(sequenceIndex));
  const actions: A0ReferenceAction[] = [];
  for (let index = 0; index < count; index += 1) {
    const action = generatedAction(state, rng, sequenceIndex, index);
    actions.push(action);
    state = applyA0ReferenceAction(state, action).state;
  }
  return Object.freeze(actions);
}

function duration(units: number) {
  const result = makeBeatDuration({
    numerator: units,
    denominator: A0_REFERENCE_BEAT_DENOMINATOR,
  });
  if (!result.ok) throw new Error(`A0_RANDOM_DURATION:${result.refusal.code}`);
  return result.value;
}

function completionFor(document: A0ReferenceDocument): MeasureCompletion {
  const units = document.events.reduce(
    (sum, event) => sum + event.durationUnits,
    0,
  );
  if (units === A0_REFERENCE_MEASURE_UNITS) {
    return Object.freeze({ kind: "complete" });
  }
  return Object.freeze({
    kind: "incomplete",
    expectedDuration: duration(units),
    reason: "Generated deterministic partial measure",
  });
}

function firstMeasure(state: AppState) {
  const measure = state.document.sections[0]?.measures[0];
  if (measure === undefined) throw new Error("A0_RANDOM_MEASURE_MISSING");
  return measure;
}

function eventById(state: AppState, id: string): ChordEvent | undefined {
  return firstMeasure(state).events.find((event) => event.id === id);
}

function commandForAction(
  state: AppState,
  action: Exclude<A0ReferenceAction, { kind: "undo" | "redo" }>,
  referenceAfter: A0ReferenceState,
  sequenceIndex: number,
  actionIndex: number,
): Readonly<{
  command: DocumentCommand;
  dependencies: ApplicationCommandDependencies;
}> {
  const envelope = a0Envelope(
    state,
    action.label,
    actionIndex,
  );
  const measure = firstMeasure(state);
  const measureId = measure.id;
  const completion = completionFor(referenceAfter.document);
  let dependencies = a0Dependencies({
    estimateHistoryRetainedBytes: () => 1,
  });
  switch (action.kind) {
    case "insert-event": {
      const source = measure.events[0];
      if (
        source === undefined ||
        source.chord.kind !== "parsed" ||
        source.chord.bass !== null ||
        source.voicing.mode !== "auto"
      ) {
        throw new Error("A0_RANDOM_INSERT_SOURCE");
      }
      const made = makeChordEvent({
        id: a0StableId("event", action.id),
        duration: duration(action.durationUnits),
        annotation: source.annotation,
        chord: source.chord,
        voicing: { ...source.voicing, family: "balanced" },
      });
      if (!made.ok) {
        throw new Error(`A0_RANDOM_INSERT_EVENT:${made.refusal.code}`);
      }
      return {
        command: {
          ...envelope,
          kind: "insert",
          insertion: {
            nodeKind: "event",
            value: made.value,
            destination: {
              kind: "event",
              measureId,
              beforeEventId: action.beforeEventId === null
                ? null
                : a0StableId("event", action.beforeEventId),
            },
            completionUpdates: [{ measureId, completion }],
          },
        },
        dependencies,
      };
    }
    case "delete-event":
      return {
        command: {
          ...envelope,
          kind: "delete",
          targets: [{
            kind: "event",
            id: a0StableId("event", action.eventId),
          }],
          completionUpdates: [{ measureId, completion }],
        },
        dependencies,
      };
    case "move-event":
      return {
        command: {
          ...envelope,
          kind: "move",
          targets: [{
            kind: "event",
            id: a0StableId("event", action.eventId),
          }],
          destination: {
            kind: "event",
            measureId,
            beforeEventId: action.beforeEventId === null
              ? null
              : a0StableId("event", action.beforeEventId),
          },
          completionUpdates: [{
            measureId,
            completion: measure.completion,
          }],
        },
        dependencies,
      };
    case "duplicate-event":
      dependencies = a0Dependencies({
        stableIdFactory: a0StableIdFactory([action.copiedEventId]),
        estimateHistoryRetainedBytes: () => 1,
      });
      return {
        command: {
          ...envelope,
          kind: "duplicate",
          targets: [{
            kind: "event",
            id: a0StableId("event", action.sourceEventId),
          }],
          destination: {
            kind: "event",
            measureId,
            beforeEventId: action.beforeEventId === null
              ? null
              : a0StableId("event", action.beforeEventId),
          },
          completionUpdates: [{ measureId, completion }],
        },
        dependencies,
      };
    case "set-duration-valid":
      return {
        command: {
          ...envelope,
          kind: "set-duration",
          eventId: a0StableId("event", action.eventId),
          duration: duration(action.durationUnits),
          completionUpdate: { measureId, completion },
        },
        dependencies,
      };
    case "set-text":
      return {
        command: {
          ...envelope,
          kind: "set-text",
          coalescing: {
            kind: "text-field",
            key: "title",
            focusSessionId:
              `focus-${String(sequenceIndex)}-${String(actionIndex)}`,
          },
          target: { kind: "document-title" },
          value: action.value,
        },
        dependencies,
      };
    case "set-section": {
      const section = state.document.sections[0];
      if (section === undefined) throw new Error("A0_RANDOM_SECTION_MISSING");
      return {
        command: {
          ...envelope,
          kind: "set-section",
          sectionId: section.id,
          patch: { name: action.value },
        },
        dependencies,
      };
    }
    case "set-voicing-valid": {
      const event = eventById(state, action.eventId);
      if (event === undefined || event.voicing.mode !== "auto") {
        throw new Error("A0_RANDOM_VOICING_SOURCE");
      }
      return {
        command: {
          ...envelope,
          kind: "set-voicing",
          eventId: event.id,
          voicing: Object.freeze({
            ...event.voicing,
            family: action.family,
          }),
        },
        dependencies,
      };
    }
  }
}

function productionDocumentProjection(
  document: ValidatedDocument,
): A0ReferenceDocument {
  const section = document.sections[0];
  const measure = section?.measures[0];
  if (section === undefined || measure === undefined) {
    throw new Error("A0_RANDOM_PROJECTION_STRUCTURE");
  }
  return Object.freeze({
    title: document.title,
    sectionName: section.name,
    events: Object.freeze(measure.events.map((event) => {
      if (event.voicing.mode !== "auto") {
        throw new Error("A0_RANDOM_PROJECTION_VOICING");
      }
      const durationUnits =
        event.duration.numerator * A0_REFERENCE_BEAT_DENOMINATOR /
        event.duration.denominator;
      if (durationUnits !== 1 && durationUnits !== 2) {
        throw new Error("A0_RANDOM_PROJECTION_DURATION");
      }
      if (
        event.voicing.family !== "balanced" &&
        event.voicing.family !== "open"
      ) {
        throw new Error("A0_RANDOM_PROJECTION_FAMILY");
      }
      return Object.freeze({
        id: String(event.id),
        durationUnits,
        voicingFamily: event.voicing.family,
      });
    })),
  });
}

function productionBookmarksProjection(bookmarks: StableUiBookmarks) {
  return Object.freeze({
    selection: bookmarks.selection.kind === "none"
      ? Object.freeze({ kind: "none" as const })
      : Object.freeze({
          kind: "events" as const,
          eventIds: Object.freeze(bookmarks.selection.eventIds.map(String)),
          anchorEventId: String(bookmarks.selection.anchorEventId),
          focusEventId: String(bookmarks.selection.focusEventId),
        }),
    insertion: bookmarks.insertion === null
      ? null
      : Object.freeze(Object.fromEntries(
          Object.entries(bookmarks.insertion).map(([key, value]) => [
            key,
            value,
          ]),
        )),
    range: bookmarks.range,
  });
}

function productionHistoryProjection(state: AppState) {
  return Object.freeze({
    undo: Object.freeze(state.history.undo.map(({ label }) => label)),
    redo: Object.freeze(state.history.redo.map(({ label }) => label)),
    retainedBytesEstimate: state.history.retainedBytesEstimate,
  });
}

function productionOutcome(result: ApplicationTransitionResult): string {
  if (!result.ok) return "refused";
  if (result.outcome === "committed") return "committed";
  if (result.outcome === "undone") return "undone";
  if (result.outcome === "redone") return "redone";
  return result.outcome;
}

function stateObservation(
  action: A0ReferenceAction,
  outcome: string,
  state: AppState,
): StepObservation {
  return Object.freeze({
    action,
    outcome,
    revision: state.revision,
    document: productionDocumentProjection(state.document),
    bookmarks: productionBookmarksProjection(state.bookmarks),
    history: productionHistoryProjection(state),
  });
}

function runSequence(
  sequenceIndex: number,
  actions: readonly A0ReferenceAction[],
  expectedStepHashes: readonly string[] | null,
): Readonly<{
  sequenceHash: string;
  stepHashes: readonly string[];
  actionCounts: Readonly<Record<ActionName, number>>;
}> {
  let reference = createA0ReferenceState(
    initialReferenceDocument(sequenceIndex),
  );
  let production = a0InitialState(a0GeneratedDocument(sequenceIndex));
  const stepHashes: string[] = [];
  const actionCounts = Object.fromEntries(
    ACTION_NAMES.map((name) => [name, 0]),
  ) as Record<ActionName, number>;
  requireEqual(
    productionDocumentProjection(production.document),
    reference.document,
    "A0_RANDOM_INITIAL_DOCUMENT",
  );
  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const action = actions[actionIndex];
    if (action === undefined) throw new Error("A0_RANDOM_ACTION_MISSING");
    actionCounts[action.kind] += 1;
    const beforeState = production;
    const beforeProjection = stateObservation(
      action,
      "input",
      beforeState,
    );
    const referenceResult = applyA0ReferenceAction(reference, action);
    let result: ApplicationTransitionResult;
    let commandSnapshot: string | null = null;
    let command: DocumentCommand | null = null;
    if (action.kind === "undo") {
      result = undoDocumentCommand({ state: production });
    } else if (action.kind === "redo") {
      result = redoDocumentCommand({ state: production });
    } else {
      const built = commandForAction(
        production,
        action,
        referenceResult.state,
        sequenceIndex,
        actionIndex,
      );
      command = built.command;
      commandSnapshot = stableJson(command);
      result = runDocumentCommand({
        state: production,
        command,
        dependencies: built.dependencies,
      });
    }
    const actualOutcome = productionOutcome(result);
    requireEqual(
      actualOutcome,
      referenceResult.outcome,
      "A0_RANDOM_OUTCOME",
    );
    requireEqual(
      stateObservation(action, "input", beforeState),
      beforeProjection,
      "A0_RANDOM_INPUT_STATE_MUTATED",
    );
    if (command !== null && commandSnapshot !== null) {
      requireEqual(
        stableJson(command),
        commandSnapshot,
        "A0_RANDOM_COMMAND_INPUT_MUTATED",
      );
    }
    production = result.state;
    reference = referenceResult.state;
    requireEqual(
      productionDocumentProjection(production.document),
      reference.document,
      "A0_RANDOM_DOCUMENT",
    );
    requireEqual(
      production.revision,
      reference.revision,
      "A0_RANDOM_REVISION",
    );
    requireEqual(
      productionBookmarksProjection(production.bookmarks),
      reference.bookmarks,
      "A0_RANDOM_BOOKMARKS",
    );
    requireEqual(
      productionHistoryProjection(production),
      a0ReferenceHistoryProjection(reference),
      "A0_RANDOM_HISTORY",
    );
    const eventIds = reference.document.events.map(({ id }) => id);
    if (new Set(eventIds).size !== eventIds.length) {
      throw new Error("A0_RANDOM_DUPLICATE_STABLE_ID");
    }
    const revalidated = validateDocumentSemantics(production.document);
    if (!revalidated.ok) {
      throw new Error(
        `A0_RANDOM_F3_REVALIDATION:${revalidated.errors[0].code}`,
      );
    }
    const observation = stateObservation(action, actualOutcome, production);
    const stepHash = sha256(observation);
    const replayHash = expectedStepHashes?.[actionIndex];
    if (replayHash !== undefined && replayHash !== stepHash) {
      throw new Error(
        `A0_RANDOM_REPLAY_MISMATCH:${String(actionIndex)}:${replayHash}:${stepHash}`,
      );
    }
    stepHashes.push(stepHash);
  }
  return Object.freeze({
    sequenceHash: sha256(stepHashes),
    stepHashes: Object.freeze(stepHashes),
    actionCounts: Object.freeze(actionCounts),
  });
}

const A0_AUTHORITATIVE_EXECUTOR_COUNT = 4;
const A0_RANDOM_SHARD_OUTPUT_MAX_CODE_UNITS = 2_097_152;
const A0_RANDOM_SHARD_SCRIPT = fileURLToPath(
  new URL("./a0-randomized-shard.ts", import.meta.url),
);

class A0RandomizedShardHarnessError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "A0RandomizedShardHarnessError";
  }
}

function validatedProtocol() {
  const protocol = sequenceFixture.randomizedProtocol;
  requireEqual(protocol.id, "A0-PROP-1000", "A0_RANDOM_PROTOCOL_ID");
  requireEqual(
    protocol.sequenceCount,
    1_000,
    "A0_RANDOM_PROTOCOL_SEQUENCE_COUNT",
  );
  requireEqual(
    protocol.actionsPerSequence,
    100,
    "A0_RANDOM_PROTOCOL_ACTION_COUNT",
  );
  requireEqual(
    protocol.seedAlgorithm,
    "splitmix64",
    "A0_RANDOM_SEED_ALGORITHM",
  );
  requireEqual(
    protocol.actionVocabulary,
    ACTION_NAMES,
    "A0_RANDOM_ACTION_VOCABULARY",
  );
  requireEqual(
    protocol.weightsPer1024,
    ACTION_WEIGHTS,
    "A0_RANDOM_ACTION_WEIGHTS",
  );
  requireEqual(
    protocol.maximumEventsInGeneratedDocument,
    A0_REFERENCE_MAX_EVENTS,
    "A0_RANDOM_MAX_EVENTS",
  );
  return protocol;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function requireHarness(
  condition: boolean,
  code: string,
): asserts condition {
  if (!condition) throw new A0RandomizedShardHarnessError(code);
}

function requireExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort((left, right) =>
    left.localeCompare(right)
  );
  const sortedExpected = [...expected].sort((left, right) =>
    left.localeCompare(right)
  );
  requireHarness(stableJson(actual) === stableJson(sortedExpected), code);
}

function safeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): number {
  requireHarness(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= minimum &&
      value <= maximum,
    code,
  );
  return value;
}

export function a0RandomizedProgressLineForProof(
  completedSequences: number,
  totalSequences: number,
  kind: "authoritative" | "profile-prefix",
): string {
  safeInteger(
    completedSequences,
    1,
    1_000,
    "A0_RANDOM_PROGRESS_COMPLETED",
  );
  safeInteger(
    totalSequences,
    completedSequences,
    1_000,
    "A0_RANDOM_PROGRESS_TOTAL",
  );
  const progress = {
    completedSequences,
    totalSequences,
    primaryActionsExecuted: completedSequences * 100,
    replayActionsExecuted: completedSequences * 100,
    wallTimeSemanticCutoff: false,
  };
  if (kind === "authoritative") {
    return `A0_RANDOM_PROGRESS ${stableJson({
      schema: "changes.evidence.a0-random-progress.v1",
      ...progress,
    })}`;
  }
  return `A0_RANDOM_PREFIX_PROFILE_PROGRESS ${stableJson({
    schema: "changes.profile.a0-random-prefix-progress.v1",
    nonAuthoritative: true,
    ...progress,
  })}`;
}

function decodeActionCounts(
  value: unknown,
  expectedTotal: number,
): Readonly<Record<ActionName, number>> {
  requireHarness(isRecord(value), "A0_RANDOM_SHARD_ACTION_COUNTS_SHAPE");
  requireExactKeys(
    value,
    ACTION_NAMES,
    "A0_RANDOM_SHARD_ACTION_COUNTS_KEYS",
  );
  const counts = Object.fromEntries(ACTION_NAMES.map((name) => [
    name,
    safeInteger(
      value[name],
      0,
      expectedTotal,
      "A0_RANDOM_SHARD_ACTION_COUNT",
    ),
  ])) as Record<ActionName, number>;
  requireHarness(
    ACTION_NAMES.reduce((sum, name) => sum + counts[name], 0) ===
      expectedTotal,
    "A0_RANDOM_SHARD_ACTION_COUNT_TOTAL",
  );
  return Object.freeze(counts);
}

function decodeShardPacket(
  source: string,
  expectedStartInclusive: number,
  expectedEndExclusive: number,
): A0RandomizedShardPacket {
  requireHarness(
    source.length <= A0_RANDOM_SHARD_OUTPUT_MAX_CODE_UNITS,
    "A0_RANDOM_SHARD_OUTPUT_LIMIT",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new A0RandomizedShardHarnessError("A0_RANDOM_SHARD_OUTPUT_JSON");
  }
  requireHarness(isRecord(parsed), "A0_RANDOM_SHARD_OUTPUT_SHAPE");
  requireExactKeys(
    parsed,
    ["schema", "startInclusive", "endExclusive", "rows"],
    "A0_RANDOM_SHARD_OUTPUT_KEYS",
  );
  requireHarness(
    parsed["schema"] === "changes.evidence.a0-randomized-sequence-shard.v1",
    "A0_RANDOM_SHARD_OUTPUT_SCHEMA",
  );
  requireHarness(
    parsed["startInclusive"] === expectedStartInclusive &&
      parsed["endExclusive"] === expectedEndExclusive,
    "A0_RANDOM_SHARD_OUTPUT_RANGE",
  );
  requireHarness(isUnknownArray(parsed["rows"]), "A0_RANDOM_SHARD_ROWS_SHAPE");
  const parsedRows = parsed["rows"];
  requireHarness(
    parsedRows.length >= 1 &&
      parsedRows.length <= expectedEndExclusive - expectedStartInclusive,
    "A0_RANDOM_SHARD_ROWS_LENGTH",
  );
  const rows: A0RandomizedSequenceRow[] = [];
  let failureSeen = false;
  for (let offset = 0; offset < parsedRows.length; offset += 1) {
    const value = parsedRows[offset];
    requireHarness(isRecord(value), "A0_RANDOM_SHARD_ROW_SHAPE");
    const sequenceIndex = expectedStartInclusive + offset;
    requireHarness(
      value["sequenceIndex"] === sequenceIndex,
      "A0_RANDOM_SHARD_ROW_SEQUENCE",
    );
    if (value["ok"] === true) {
      requireHarness(!failureSeen, "A0_RANDOM_SHARD_ROW_AFTER_FAILURE");
      requireExactKeys(
        value,
        ["ok", "sequenceIndex", "sequenceHash", "actionCounts"],
        "A0_RANDOM_SHARD_SUCCESS_KEYS",
      );
      requireHarness(
        typeof value["sequenceHash"] === "string" &&
          /^[0-9a-f]{64}$/.test(value["sequenceHash"]),
        "A0_RANDOM_SHARD_SEQUENCE_HASH",
      );
      rows.push(Object.freeze({
        ok: true,
        sequenceIndex,
        sequenceHash: value["sequenceHash"],
        actionCounts: decodeActionCounts(value["actionCounts"], 100),
      }));
      continue;
    }
    requireHarness(value["ok"] === false, "A0_RANDOM_SHARD_ROW_DISCRIMINANT");
    requireExactKeys(
      value,
      ["ok", "sequenceIndex", "message"],
      "A0_RANDOM_SHARD_FAILURE_KEYS",
    );
    requireHarness(
      typeof value["message"] === "string" &&
        value["message"].length >= 1 &&
        value["message"].length <= 65_536,
      "A0_RANDOM_SHARD_FAILURE_MESSAGE",
    );
    failureSeen = true;
    requireHarness(
      offset === parsedRows.length - 1,
      "A0_RANDOM_SHARD_FAILURE_NOT_LAST",
    );
    rows.push(Object.freeze({
      ok: false,
      sequenceIndex,
      message: value["message"],
    }));
  }
  requireHarness(
    failureSeen ||
      rows.length === expectedEndExclusive - expectedStartInclusive,
    "A0_RANDOM_SHARD_SUCCESS_COVERAGE",
  );
  return Object.freeze({
    schema: "changes.evidence.a0-randomized-sequence-shard.v1",
    startInclusive: expectedStartInclusive,
    endExclusive: expectedEndExclusive,
    rows: Object.freeze(rows),
  });
}

function shardRanges(
  sequenceCount: number,
  executorCount: 1 | 4,
): readonly Readonly<{
  startInclusive: number;
  endExclusive: number;
}>[] {
  const count = Math.min(sequenceCount, executorCount);
  const baseSize = Math.floor(sequenceCount / count);
  const remainder = sequenceCount % count;
  const ranges: Array<Readonly<{
    startInclusive: number;
    endExclusive: number;
  }>> = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    ranges.push(Object.freeze({
      startInclusive: cursor,
      endExclusive: cursor + size,
    }));
    cursor += size;
  }
  return Object.freeze(ranges);
}

async function spawnShard(
  range: Readonly<{ startInclusive: number; endExclusive: number }>,
): Promise<A0RandomizedShardPacket> {
  const request = stableJson({
    schema: "changes.evidence.a0-randomized-sequence-shard-request.v1",
    startInclusive: range.startInclusive,
    endExclusive: range.endExclusive,
  });
  const child = Bun.spawn({
    cmd: [process.execPath, A0_RANDOM_SHARD_SCRIPT],
    cwd: process.cwd(),
    env: {
      ...process.env,
      BUN_OPTIONS: "",
      NODE_OPTIONS: "",
    },
    stdin: new Blob([request], { type: "application/json" }),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  requireHarness(exitCode === 0, "A0_RANDOM_SHARD_EXIT");
  requireHarness(stderr.length === 0, "A0_RANDOM_SHARD_STDERR");
  return decodeShardPacket(
    stdout,
    range.startInclusive,
    range.endExclusive,
  );
}

async function runSubprocessShards(
  sequenceCount: number,
  executorCount: 1 | 4,
): Promise<readonly A0RandomizedShardPacket[]> {
  const ranges = shardRanges(sequenceCount, executorCount);
  return Object.freeze(await Promise.all(ranges.map(spawnShard)));
}

export function runA0RandomizedSequenceRange(
  request: Readonly<{ startInclusive: number; endExclusive: number }>,
): A0RandomizedShardPacket {
  const protocol = validatedProtocol();
  const startInclusive = safeInteger(
    request.startInclusive,
    0,
    protocol.sequenceCount - 1,
    "A0_RANDOM_SHARD_REQUEST_START",
  );
  const endExclusive = safeInteger(
    request.endExclusive,
    startInclusive + 1,
    protocol.sequenceCount,
    "A0_RANDOM_SHARD_REQUEST_END",
  );
  const rootSeed = BigInt(protocol.rootSeedHex);
  const rows: A0RandomizedSequenceRow[] = [];
  for (
    let sequenceIndex = startInclusive;
    sequenceIndex < endExclusive;
    sequenceIndex += 1
  ) {
    try {
      const seed = sequenceSeed(rootSeed, sequenceIndex);
      const actions = generateActions(
        seed,
        sequenceIndex,
        protocol.actionsPerSequence,
      );
      const primary = runSequence(sequenceIndex, actions, null);
      const replay = runSequence(
        sequenceIndex,
        actions,
        primary.stepHashes,
      );
      requireEqual(
        replay.sequenceHash,
        primary.sequenceHash,
        "A0_RANDOM_SEQUENCE_REPLAY",
      );
      rows.push(Object.freeze({
        ok: true,
        sequenceIndex,
        sequenceHash: primary.sequenceHash,
        actionCounts: primary.actionCounts,
      }));
    } catch (error) {
      rows.push(Object.freeze({
        ok: false,
        sequenceIndex,
        message: error instanceof Error ? error.message : String(error),
      }));
      break;
    }
  }
  return Object.freeze({
    schema: "changes.evidence.a0-randomized-sequence-shard.v1",
    startInclusive,
    endExclusive,
    rows: Object.freeze(rows),
  });
}

export function runA0RandomizedSequenceRangeFromJson(
  source: string,
): A0RandomizedShardPacket {
  requireHarness(
    source.length <= 1_024,
    "A0_RANDOM_SHARD_REQUEST_LIMIT",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new A0RandomizedShardHarnessError("A0_RANDOM_SHARD_REQUEST_JSON");
  }
  requireHarness(isRecord(parsed), "A0_RANDOM_SHARD_REQUEST_SHAPE");
  requireExactKeys(
    parsed,
    ["schema", "startInclusive", "endExclusive"],
    "A0_RANDOM_SHARD_REQUEST_KEYS",
  );
  requireHarness(
    parsed["schema"] ===
      "changes.evidence.a0-randomized-sequence-shard-request.v1",
    "A0_RANDOM_SHARD_REQUEST_SCHEMA",
  );
  return runA0RandomizedSequenceRange({
    startInclusive: safeInteger(
      parsed["startInclusive"],
      0,
      999,
      "A0_RANDOM_SHARD_REQUEST_START",
    ),
    endExclusive: safeInteger(
      parsed["endExclusive"],
      1,
      1_000,
      "A0_RANDOM_SHARD_REQUEST_END",
    ),
  });
}

export function reduceA0RandomizedShardPacketsForProof(
  packets: readonly A0RandomizedShardPacket[],
  sequenceCount: number,
): A0RandomizedOrderedShardOutcome {
  requireHarness(
    Number.isSafeInteger(sequenceCount) &&
      sequenceCount >= 1 &&
      sequenceCount <= 1_000,
    "A0_RANDOM_SHARD_REDUCTION_COUNT",
  );
  const sorted = [...packets].sort(
    (left, right) => left.startInclusive - right.startInclusive,
  );
  let rangeCursor = 0;
  const rowsBySequence = new Map<number, A0RandomizedSequenceRow>();
  for (const packet of sorted) {
    requireHarness(
      packet.startInclusive === rangeCursor &&
        packet.endExclusive > packet.startInclusive &&
        packet.endExclusive <= sequenceCount,
      "A0_RANDOM_SHARD_REDUCTION_RANGES",
    );
    let failureSeen = false;
    for (let offset = 0; offset < packet.rows.length; offset += 1) {
      const row = packet.rows[offset];
      const expectedIndex = packet.startInclusive + offset;
      requireHarness(
        row !== undefined &&
          row.sequenceIndex === expectedIndex &&
          !rowsBySequence.has(expectedIndex),
        "A0_RANDOM_SHARD_REDUCTION_ROW",
      );
      requireHarness(
        !failureSeen,
        "A0_RANDOM_SHARD_REDUCTION_AFTER_FAILURE",
      );
      rowsBySequence.set(expectedIndex, row);
      if (!row.ok) {
        failureSeen = true;
        requireHarness(
          offset === packet.rows.length - 1,
          "A0_RANDOM_SHARD_REDUCTION_FAILURE_NOT_LAST",
        );
      }
    }
    requireHarness(
      failureSeen ||
        packet.rows.length === packet.endExclusive - packet.startInclusive,
      "A0_RANDOM_SHARD_REDUCTION_PACKET_COVERAGE",
    );
    rangeCursor = packet.endExclusive;
  }
  requireHarness(
    rangeCursor === sequenceCount,
    "A0_RANDOM_SHARD_REDUCTION_COVERAGE",
  );
  const failure = [...rowsBySequence.values()]
    .filter((row): row is A0RandomizedSequenceFailureRow => !row.ok)
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)[0] ?? null;
  const successLimit = failure?.sequenceIndex ?? sequenceCount;
  const successes: A0RandomizedSequenceSuccessRow[] = [];
  for (let sequenceIndex = 0; sequenceIndex < successLimit; sequenceIndex += 1) {
    const row = rowsBySequence.get(sequenceIndex);
    requireHarness(
      row?.ok === true,
      "A0_RANDOM_SHARD_REDUCTION_PREFIX",
    );
    successes.push(row);
  }
  if (failure !== null) {
    requireHarness(
      rowsBySequence.get(failure.sequenceIndex) === failure,
      "A0_RANDOM_SHARD_REDUCTION_FAILURE",
    );
  }
  return Object.freeze({
    successes: Object.freeze(successes),
    failure,
  });
}

export async function runA0RandomizedSubprocessRangesForProof(
  sequenceCount: number,
  executorCount: 1 | 4,
): Promise<A0RandomizedOrderedShardOutcome> {
  const protocol = validatedProtocol();
  safeInteger(
    sequenceCount,
    1,
    protocol.sequenceCount,
    "A0_RANDOM_SHARD_PROOF_SEQUENCE_COUNT",
  );
  return reduceA0RandomizedShardPacketsForProof(
    await runSubprocessShards(sequenceCount, executorCount),
    sequenceCount,
  );
}

export function decodeA0RandomizedShardOutputForProof(
  source: string,
  startInclusive: number,
  endExclusive: number,
): A0RandomizedShardPacket {
  return decodeShardPacket(source, startInclusive, endExclusive);
}

export async function runA0RandomizedProtocol(
  request: A0RandomizedProtocolRunRequest,
): Promise<A0RandomizedProtocolRunResult> {
  const protocol = validatedProtocol();
  const sequenceCount = request.kind === "authoritative"
    ? protocol.sequenceCount
    : request.sequenceCount;
  if (
    !Number.isSafeInteger(sequenceCount) ||
    sequenceCount < 1 ||
    sequenceCount > protocol.sequenceCount
  ) {
    throw new Error("A0_RANDOM_PROFILE_SEQUENCE_COUNT");
  }
  const rootSeed = BigInt(protocol.rootSeedHex);
  const sequenceHashes: string[] = [];
  const aggregateActionCounts = Object.fromEntries(
    ACTION_NAMES.map((name) => [name, 0]),
  ) as Record<ActionName, number>;
  const actionLogHash = createHash("sha256");
  const outcomeLogHash = createHash("sha256");
  let currentSequence = -1;
  let currentSeed = 0n;
  let currentActions: readonly A0ReferenceAction[] = [];
  const commitSuccess = (
    success: A0RandomizedSequenceSuccessRow,
  ): void => {
    sequenceHashes.push(success.sequenceHash);
    outcomeLogHash.update(success.sequenceHash);
    for (const name of ACTION_NAMES) {
      aggregateActionCounts[name] += success.actionCounts[name];
    }
    const completedSequences = success.sequenceIndex + 1;
    if (completedSequences % 100 !== 0) return;
    console.log(a0RandomizedProgressLineForProof(
      completedSequences,
      sequenceCount,
      request.kind,
    ));
  };
  try {
    if (request.kind === "authoritative") {
      for (
        let sequenceIndex = 0;
        sequenceIndex < sequenceCount;
        sequenceIndex += 1
      ) {
        currentSequence = sequenceIndex;
        currentSeed = sequenceSeed(rootSeed, sequenceIndex);
        const actions = generateActions(
          currentSeed,
          sequenceIndex,
          protocol.actionsPerSequence,
        );
        currentActions = actions;
        const regenerated = generateActions(
          currentSeed,
          sequenceIndex,
          protocol.actionsPerSequence,
        );
        requireEqual(regenerated, actions, "A0_RANDOM_GENERATOR_REPLAY");
        actionLogHash.update(stableJson({
          sequenceIndex,
          seedHex: `0x${currentSeed.toString(16).padStart(16, "0")}`,
          actions,
        }));
      }
      const outcome = reduceA0RandomizedShardPacketsForProof(
        await runSubprocessShards(
          sequenceCount,
          A0_AUTHORITATIVE_EXECUTOR_COUNT,
        ),
        sequenceCount,
      );
      for (const success of outcome.successes) {
        currentSequence = success.sequenceIndex;
        currentSeed = sequenceSeed(rootSeed, success.sequenceIndex);
        currentActions = [];
        commitSuccess(success);
      }
      if (outcome.failure !== null) {
        currentSequence = outcome.failure.sequenceIndex;
        currentSeed = sequenceSeed(rootSeed, currentSequence);
        currentActions = generateActions(
          currentSeed,
          currentSequence,
          protocol.actionsPerSequence,
        );
        throw new Error(outcome.failure.message);
      }
    } else {
      for (
        let sequenceIndex = 0;
        sequenceIndex < sequenceCount;
        sequenceIndex += 1
      ) {
        currentSequence = sequenceIndex;
        currentSeed = sequenceSeed(rootSeed, sequenceIndex);
        const actions = generateActions(
          currentSeed,
          sequenceIndex,
          protocol.actionsPerSequence,
        );
        currentActions = actions;
        const regenerated = generateActions(
          currentSeed,
          sequenceIndex,
          protocol.actionsPerSequence,
        );
        requireEqual(regenerated, actions, "A0_RANDOM_GENERATOR_REPLAY");
        actionLogHash.update(stableJson({
          sequenceIndex,
          seedHex: `0x${currentSeed.toString(16).padStart(16, "0")}`,
          actions,
        }));
        const primary = runSequence(sequenceIndex, actions, null);
        const replay = runSequence(
          sequenceIndex,
          actions,
          primary.stepHashes,
        );
        requireEqual(
          replay.sequenceHash,
          primary.sequenceHash,
          "A0_RANDOM_SEQUENCE_REPLAY",
        );
        commitSuccess(Object.freeze({
          ok: true,
          sequenceIndex,
          sequenceHash: primary.sequenceHash,
          actionCounts: primary.actionCounts,
        }));
      }
    }
  } catch (error) {
    if (error instanceof A0RandomizedShardHarnessError) throw error;
    const failure = {
      schema: "changes.evidence.a0-random-failure.v1",
      protocolId: protocol.id,
      rootSeedHex: protocol.rootSeedHex,
      sequenceIndex: currentSequence,
      sequenceSeedHex:
        `0x${currentSeed.toString(16).padStart(16, "0")}`,
      actions: currentActions,
      message: error instanceof Error ? error.message : String(error),
    };
    if (request.kind === "authoritative") {
      console.error(`A0_RANDOM_FAILURE ${stableJson(failure)}`);
    } else {
      console.error(`A0_RANDOM_PREFIX_PROFILE_FAILURE ${stableJson({
        ...failure,
        nonAuthoritative: true,
      })}`);
    }
    throw error;
  }
  const baseObservation = {
    protocolId: protocol.id,
    rootSeedHex: protocol.rootSeedHex,
    seedAlgorithm: protocol.seedAlgorithm,
    sequenceSeedDerivation: protocol.sequenceSeedDerivation,
    sequencesExecuted: sequenceCount,
    actionsPerSequence: protocol.actionsPerSequence,
    primaryActionsExecuted:
      sequenceCount * protocol.actionsPerSequence,
    replayActionsExecuted:
      sequenceCount * protocol.actionsPerSequence,
    oracleComparisons:
      sequenceCount * protocol.actionsPerSequence * 10,
    f3Revalidations:
      sequenceCount * protocol.actionsPerSequence * 2,
    maximumEvents: protocol.maximumEventsInGeneratedDocument,
    actionCounts: aggregateActionCounts,
    actionLogSha256: actionLogHash.digest("hex"),
    outcomeLogSha256: outcomeLogHash.digest("hex"),
    sequenceDigestSha256: sha256(sequenceHashes),
    failureLogs: 0,
    deterministicReplays: sequenceCount,
    wallTimeSemanticCutoff: false,
  };
  if (request.kind === "authoritative") {
    console.log(`A0_RANDOM_OBSERVATION ${stableJson({
      schema: "changes.evidence.a0-randomized-sequences-observation.v1",
      ...baseObservation,
      status: "pass",
    })}`);
  } else {
    console.log(`A0_RANDOM_PREFIX_PROFILE ${stableJson({
      schema: "changes.profile.a0-random-prefix-observation.v1",
      nonAuthoritative: true,
      sourceSequenceCount: protocol.sequenceCount,
      sequencePrefix: [0, sequenceCount - 1],
      ...baseObservation,
      status: "profile-complete",
    })}`);
  }
  return Object.freeze({
    sequenceHashes: Object.freeze(sequenceHashes),
    actionCounts: Object.freeze(aggregateActionCounts),
    allActionKindsObserved:
      ACTION_NAMES.every((name) => aggregateActionCounts[name] > 0),
  });
}
