import {
  createInitialAppState,
  applicationHistoryRetainedByteEstimator,
  validateDocumentSemantics,
  type AppState,
  type ApplicationCommandDependencies,
  type PanelState,
} from "../../src/application";
import {
  copyDomain,
  decodeDocumentShape,
  makeBeatPosition,
  parseStableId,
  type StableIdFactory,
  type StableIdFor,
  type StableIdKind,
  type ValidatedDocument,
} from "../../src/domain";
import {
  materializeF3Input,
  requireF3Array,
  requireF3Record,
  type F3FixtureRecord,
} from "../../src/test-support/f3-publication-materializer";
import publicationFixture from "../fixtures/publication/document-cases.json";

export function publishA0Candidate(candidate: unknown): ValidatedDocument {
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) {
    throw new Error(`A0_TEST_F2:${decoded.errors[0].code}`);
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(`A0_TEST_F3:${published.errors[0].code}`);
  }
  return published.value;
}

export function a0Candidate(
  template = "representativeParsedAuto",
): F3FixtureRecord {
  return materializeF3Input(publicationFixture, {
    template,
    operations: [],
  });
}

export function a0TemplateDocument(
  template = "representativeParsedAuto",
): ValidatedDocument {
  return publishA0Candidate(a0Candidate(template));
}

export function a0MultiEventDocument(): ValidatedDocument {
  const root = a0Candidate();
  const section = requireF3Record(
    requireF3Array(root["sections"], "sections")[0],
    "section",
  );
  const measure = requireF3Record(
    requireF3Array(section["measures"], "measures")[0],
    "measure",
  );
  const event = requireF3Record(
    requireF3Array(measure["events"], "events")[0],
    "event",
  );
  measure["events"] = [
    { ...structuredClone(event), id: "event-a0-1", duration: { numerator: 1, denominator: 1 } },
    { ...structuredClone(event), id: "event-a0-2", duration: { numerator: 1, denominator: 1 } },
    { ...structuredClone(event), id: "event-a0-3", duration: { numerator: 2, denominator: 1 } },
  ];
  return publishA0Candidate(root);
}

export function a0PartialThreeEventDocument(): ValidatedDocument {
  const root = a0Candidate();
  const section = requireF3Record(
    requireF3Array(root["sections"], "sections")[0],
    "section",
  );
  const measure = requireF3Record(
    requireF3Array(section["measures"], "measures")[0],
    "measure",
  );
  const event = requireF3Record(
    requireF3Array(measure["events"], "events")[0],
    "event",
  );
  measure["events"] = [1, 2, 3].map((ordinal) => ({
    ...structuredClone(event),
    id: `event-a0-${String(ordinal)}`,
    duration: { numerator: 1, denominator: 1 },
  }));
  measure["completion"] = {
    kind: "incomplete",
    expectedDuration: { numerator: 3, denominator: 1 },
    reason: "Named sequence partial measure",
  };
  return publishA0Candidate(root);
}

/**
 * Independently materialized one-measure document used by the fixed-seed A0
 * reference-model protocol. Durations are exact 1/32-beat units so every
 * generated edit remains inside one 4/4 measure through the 64-event bound.
 */
export function a0GeneratedDocument(sequenceIndex: number): ValidatedDocument {
  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
    throw new Error("A0_TEST_GENERATED_SEQUENCE_INDEX");
  }
  const root = a0Candidate();
  root["id"] = `doc-a0-random-${String(sequenceIndex)}`;
  root["title"] = `Random sequence ${String(sequenceIndex)}`;
  const section = requireF3Record(
    requireF3Array(root["sections"], "sections")[0],
    "section",
  );
  section["id"] = `section-a0-random-${String(sequenceIndex)}`;
  section["name"] = `Section ${String(sequenceIndex)}`;
  const measure = requireF3Record(
    requireF3Array(section["measures"], "measures")[0],
    "measure",
  );
  measure["id"] = `measure-a0-random-${String(sequenceIndex)}`;
  const event = requireF3Record(
    requireF3Array(measure["events"], "events")[0],
    "event",
  );
  measure["events"] = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(event),
    id: `event-a0-random-${String(sequenceIndex)}-${String(index + 1)}`,
    duration: { numerator: 1, denominator: 16 },
  }));
  measure["completion"] = {
    kind: "incomplete",
    expectedDuration: { numerator: 1, denominator: 4 },
    reason: "Generated deterministic partial measure",
  };
  return publishA0Candidate(root);
}

export function a0MultiMeasureDocument(): ValidatedDocument {
  const root = a0Candidate();
  const section = requireF3Record(
    requireF3Array(root["sections"], "sections")[0],
    "section",
  );
  const measure = requireF3Record(
    requireF3Array(section["measures"], "measures")[0],
    "measure",
  );
  const event = requireF3Record(
    requireF3Array(measure["events"], "events")[0],
    "event",
  );
  section["measures"] = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(measure),
    id: `measure-a0-${String(index + 1)}`,
    events: [
      {
        ...structuredClone(event),
        id: `event-a0-measure-${String(index + 1)}`,
      },
    ],
  }));
  return publishA0Candidate(root);
}

export function a0TwoMeasureEventDocument(): ValidatedDocument {
  const root = a0Candidate();
  const section = requireF3Record(
    requireF3Array(root["sections"], "sections")[0],
    "section",
  );
  const measure = requireF3Record(
    requireF3Array(section["measures"], "measures")[0],
    "measure",
  );
  const event = requireF3Record(
    requireF3Array(measure["events"], "events")[0],
    "event",
  );
  section["measures"] = [1, 2].map((ordinal) => ({
    ...structuredClone(measure),
    id: `measure-a0-pair-${String(ordinal)}`,
    events: [
      {
        ...structuredClone(event),
        id: `event-a0-pair-${String(ordinal)}`,
      },
    ],
  }));
  return publishA0Candidate(root);
}

export function a0StableId<K extends StableIdKind>(
  kind: K,
  wire: string,
): StableIdFor<K> {
  const parsed = parseStableId(kind, wire);
  if (!parsed.ok) throw new Error(`A0_TEST_ID:${kind}:${wire}`);
  return parsed.value;
}

export function a0StableIdFactory(
  explicitWires: readonly string[] = [],
): StableIdFactory {
  let nextIndex = 0;
  return {
    next: <K extends StableIdKind>(kind: K) => {
      const wire =
        explicitWires[nextIndex] ??
        `a0-copy-${kind}-${String(nextIndex + 1)}`;
      nextIndex += 1;
      const parsed = parseStableId(kind, wire);
      if (!parsed.ok) {
        return {
          ok: false as const,
          refusal: {
            code: "id.factory_exhausted" as const,
            kind,
            path: ["id"] as const,
          },
        };
      }
      return {
        ok: true as const,
        value: parsed.value,
        source: "deterministic-test" as const,
      };
    },
  };
}

export function a0Dependencies(
  overrides: Partial<ApplicationCommandDependencies> = {},
): ApplicationCommandDependencies {
  return Object.freeze({
    decodeDocumentShape,
    validateDocumentSemantics,
    copyDomain,
    stableIdFactory: a0StableIdFactory(),
    estimateHistoryRetainedBytes: applicationHistoryRetainedByteEstimator,
    ...overrides,
  });
}

const DEFAULT_A0_PANELS = Object.freeze({
  open: Object.freeze(["chart", "inspector"] as const),
  active: "chart" as const,
  leftRailCollapsed: false,
  rightRailCollapsed: false,
}) satisfies PanelState;

export function a0InitialState(
  document = a0TemplateDocument(),
  initialPanels: PanelState = DEFAULT_A0_PANELS,
): AppState {
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zero.ok) throw new Error("A0_TEST_ZERO_BEAT");
  const result = createInitialAppState({
    document,
    zeroBeat: zero.value,
    initialPanels,
  });
  if (!result.ok) throw new Error(`A0_TEST_INITIAL:${result.refusal.code}`);
  return result.state;
}

export function a0Envelope(
  state: AppState,
  id: string,
  logicalTimeMs: number,
): Readonly<{
  id: string;
  label: string;
  expectedDocumentId: AppState["document"]["id"];
  expectedRevision: number;
  logicalTimeMs: number;
  coalescing: null;
}> {
  return {
    id,
    label: id,
    expectedDocumentId: state.document.id,
    expectedRevision: state.revision,
    logicalTimeMs,
    coalescing: null,
  };
}
