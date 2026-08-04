import {
  KEY_MODES,
  MAX_JSON_NESTING_DEPTH,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_SHORT_TEXT_CODE_POINTS,
  SECTION_VOICE_LEADING_BOUNDARIES,
  parseStableId,
  type DomainPath,
  type StableIdKind,
} from "../domain";
import {
  A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS,
  A0_U1_NEW_EVENT_POLICY_ID,
  MAX_A0_U1_METADATA_CODE_POINTS_OBSERVED,
  type ApplyEditPlanCommand,
  type AtomicEditPlanWorkEvidence,
} from "./application-edit-plan-contract";
import { MAX_COMMAND_ID_CODE_POINTS } from "./application-state-contract";

const MAX_PASSIVE_CAPTURE_ARRAY_LENGTH = 100_000;
const MAX_PASSIVE_CAPTURE_RECORDS = 100_000;

type ShapeRefusalCode =
  | "edit-plan.command-shape-invalid"
  | "edit-plan.plan-shape-invalid";

export type AtomicEditPlanRuntimeShapeWork = Readonly<
  Pick<
    AtomicEditPlanWorkEvidence,
    | "planNodesVisited"
    | "metadataFieldsCompared"
    | "metadataCodePointsObserved"
    | "peakPlanNodeRecords"
  >
>;

export type AtomicEditPlanRuntimeShapeDecodeResult =
  | Readonly<{
      ok: true;
      value: ApplyEditPlanCommand;
      shapeWork: AtomicEditPlanRuntimeShapeWork;
    }>
  | Readonly<{
      ok: false;
      code: ShapeRefusalCode;
      path: DomainPath;
      shapeWork: AtomicEditPlanRuntimeShapeWork;
      observed?: number;
      maximum?: number;
    }>;

type CapturedScalar = Readonly<{
  kind: "scalar";
  value: unknown;
}>;

type CapturedInvalid = Readonly<{
  kind: "invalid";
}>;

type CapturedProperty = Readonly<{
  key: PropertyKey;
  enumerable: boolean;
  data: boolean;
  value: CapturedValue;
}>;

type CapturedRecord = Readonly<{
  kind: "record";
  prototypeValid: boolean;
  properties: readonly CapturedProperty[];
}>;

type CapturedArray = Readonly<{
  kind: "array";
  prototypeValid: boolean;
  invalidOwnShape: boolean;
  values: readonly CapturedValue[];
}>;

type CapturedValue =
  | CapturedScalar
  | CapturedInvalid
  | CapturedRecord
  | CapturedArray;

type CaptureState = {
  readonly active: WeakSet<object>;
  recordsObserved: number;
};

type CaptureResult =
  | Readonly<{ ok: true; value: CapturedValue }>
  | Readonly<{ ok: false; path: DomainPath }>;

type BoundedTextScan = Readonly<{
  observed: number;
  maximum: number;
  unicodeValid: boolean;
  exceeded: boolean;
  nonblank: boolean;
  truncated: boolean;
}>;

type BoundedTextScanLedger = {
  readonly scans: Map<string, BoundedTextScan>;
  observed: number;
};

const INVALID_CAPTURE: CapturedInvalid = Object.freeze({ kind: "invalid" });

function immutablePath(
  segments: readonly (string | number)[],
): DomainPath {
  return Object.freeze([...segments]);
}

function isReference(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  );
}

function descriptorValue(descriptor: PropertyDescriptor): unknown {
  return (descriptor as Readonly<{ value?: unknown }>).value;
}

function arrayIndexFromOwnKey(key: PropertyKey): number | null {
  if (typeof key !== "string" || key.length === 0) return null;
  const index = Number(key);
  return Number.isInteger(index) &&
    index >= 0 &&
    index < 4_294_967_295 &&
    String(index) === key
    ? index
    : null;
}

function capturePassiveData(
  value: unknown,
  path: readonly (string | number)[],
  state: CaptureState,
  depth: number,
): CaptureResult {
  if (!isReference(value)) {
    return {
      ok: true,
      value: Object.freeze({ kind: "scalar", value }),
    };
  }
  if (
    state.active.has(value) ||
    depth > MAX_JSON_NESTING_DEPTH ||
    state.recordsObserved >= MAX_PASSIVE_CAPTURE_RECORDS
  ) {
    return { ok: true, value: INVALID_CAPTURE };
  }

  state.recordsObserved += 1;
  let ownKeys: readonly PropertyKey[];
  let prototype: object | null;
  try {
    ownKeys = Reflect.ownKeys(value);
    prototype = Reflect.getPrototypeOf(value);
  } catch {
    return { ok: false, path: immutablePath(path) };
  }

  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      const prototypeValid = prototype === Array.prototype;
      let lengthDescriptor: PropertyDescriptor | undefined;
      try {
        lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
      } catch {
        return { ok: false, path: immutablePath(path) };
      }
      const lengthValue =
        lengthDescriptor !== undefined &&
        Object.hasOwn(lengthDescriptor, "value")
          ? descriptorValue(lengthDescriptor)
          : null;
      const length =
        Number.isSafeInteger(lengthValue) &&
        typeof lengthValue === "number" &&
        lengthValue >= 0 &&
        lengthValue <= MAX_PASSIVE_CAPTURE_ARRAY_LENGTH
          ? lengthValue
          : null;
      let invalidOwnShape = length === null;
      if (length !== null) {
        for (const key of ownKeys) {
          if (key === "length") continue;
          const index = arrayIndexFromOwnKey(key);
          if (index === null || index >= length) {
            invalidOwnShape = true;
            break;
          }
        }
      }
      if (!prototypeValid || invalidOwnShape || length === null) {
        return {
          ok: true,
          value: Object.freeze({
            kind: "array",
            prototypeValid,
            invalidOwnShape,
            values: Object.freeze([]),
          }),
        };
      }

      const values: CapturedValue[] = [];
      for (let index = 0; index < length; index += 1) {
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Reflect.getOwnPropertyDescriptor(
            value,
            String(index),
          );
        } catch {
          return {
            ok: false,
            path: immutablePath([...path, index]),
          };
        }
        if (
          descriptor === undefined ||
          !Object.hasOwn(descriptor, "value") ||
          descriptor.enumerable !== true
        ) {
          values.push(INVALID_CAPTURE);
          break;
        }
        const child = capturePassiveData(
          descriptorValue(descriptor),
          [...path, index],
          state,
          depth + 1,
        );
        if (!child.ok) return child;
        values.push(child.value);
        if (child.value.kind === "invalid") break;
      }
      return {
        ok: true,
        value: Object.freeze({
          kind: "array",
          prototypeValid,
          invalidOwnShape: false,
          values: Object.freeze(values),
        }),
      };
    }

    const prototypeValid =
      prototype === Object.prototype || prototype === null;
    const properties: CapturedProperty[] = [];
    for (const key of ownKeys) {
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      } catch {
        return {
          ok: false,
          path: immutablePath(
            typeof key === "string" ? [...path, key] : path,
          ),
        };
      }
      if (descriptor === undefined) {
        return { ok: false, path: immutablePath(path) };
      }
      const data = Object.hasOwn(descriptor, "value");
      let childValue: CapturedValue = INVALID_CAPTURE;
      if (data && typeof key === "string") {
        const child = capturePassiveData(
          descriptorValue(descriptor),
          [...path, key],
          state,
          depth + 1,
        );
        if (!child.ok) return child;
        childValue = child.value;
      }
      properties.push(
        Object.freeze({
          key,
          enumerable: descriptor.enumerable === true,
          data,
          value: childValue,
        }),
      );
    }
    return {
      ok: true,
      value: Object.freeze({
        kind: "record",
        prototypeValid,
        properties: Object.freeze(properties),
      }),
    };
  } finally {
    state.active.delete(value);
  }
}

function propertyAt(
  record: CapturedRecord,
  key: string,
): CapturedProperty | undefined {
  return record.properties.find((property) => property.key === key);
}

function valueAt(
  record: CapturedRecord,
  key: string,
): CapturedValue | undefined {
  return propertyAt(record, key)?.value;
}

function scalarAt(
  record: CapturedRecord,
  key: string,
): unknown {
  const value = valueAt(record, key);
  return value?.kind === "scalar" ? value.value : undefined;
}

function scalarValue(value: CapturedValue | undefined): unknown {
  return value?.kind === "scalar" ? value.value : undefined;
}

function recordValue(
  value: CapturedValue | undefined,
): CapturedRecord | null {
  return value?.kind === "record" && value.prototypeValid ? value : null;
}

function arrayValue(
  value: CapturedValue | undefined,
): CapturedArray | null {
  return value?.kind === "array" &&
    value.prototypeValid &&
    !value.invalidOwnShape
    ? value
    : null;
}

function firstExactKeyFailure(
  value: CapturedValue | undefined,
  keys: readonly string[],
  path: readonly (string | number)[],
): DomainPath | null {
  if (
    value?.kind !== "record" ||
    !value.prototypeValid
  ) {
    return immutablePath(path);
  }
  const missing = keys.find((key) => propertyAt(value, key) === undefined);
  if (missing !== undefined) return immutablePath([...path, missing]);
  const unexpected = value.properties.find(
    (property) =>
      typeof property.key !== "string" || !keys.includes(property.key),
  );
  if (unexpected !== undefined) return immutablePath(path);
  const invalid = keys.find((key) => {
    const property = propertyAt(value, key);
    return (
      property === undefined ||
      !property.data ||
      !property.enumerable ||
      property.value.kind === "invalid"
    );
  });
  return invalid === undefined
    ? null
    : immutablePath([...path, invalid]);
}

function isEcmaTrimWhitespace(unit: number): boolean {
  return (
    (unit >= 0x0009 && unit <= 0x000d) ||
    unit === 0x0020 ||
    unit === 0x00a0 ||
    unit === 0x1680 ||
    (unit >= 0x2000 && unit <= 0x200a) ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    unit === 0x202f ||
    unit === 0x205f ||
    unit === 0x3000 ||
    unit === 0xfeff
  );
}

function scanBoundedText(
  value: string,
  maximum: number,
  observationLimit = maximum + 1,
): BoundedTextScan {
  let observed = 0;
  let nonblank = false;
  for (let index = 0; index < value.length; ) {
    if (observed >= observationLimit) {
      return {
        observed,
        maximum,
        unicodeValid: true,
        exceeded: false,
        nonblank,
        truncated: true,
      };
    }
    const unit = value.charCodeAt(index);
    observed += 1;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return {
          observed,
          maximum,
          unicodeValid: false,
          exceeded: observed > maximum,
          nonblank: true,
          truncated: false,
        };
      }
      index += 2;
      nonblank = true;
    } else {
      index += 1;
      if (unit >= 0xdc00 && unit <= 0xdfff) {
        return {
          observed,
          maximum,
          unicodeValid: false,
          exceeded: observed > maximum,
          nonblank: true,
          truncated: false,
        };
      }
      if (!isEcmaTrimWhitespace(unit)) nonblank = true;
    }
    if (observed > maximum) {
      return {
        observed,
        maximum,
        unicodeValid: true,
        exceeded: true,
        nonblank,
        truncated: false,
      };
    }
  }
  return {
    observed,
    maximum,
    unicodeValid: true,
    exceeded: false,
    nonblank,
    truncated: false,
  };
}

function textScanKey(path: readonly (string | number)[]): string {
  return JSON.stringify(path);
}

function scanBoundedTextAtPath(
  ledger: BoundedTextScanLedger,
  path: readonly (string | number)[],
  value: string,
  maximum: number,
): BoundedTextScan {
  const key = textScanKey(path);
  const existing = ledger.scans.get(key);
  if (existing !== undefined) return existing;
  const remaining =
    MAX_A0_U1_METADATA_CODE_POINTS_OBSERVED - ledger.observed;
  const scan = scanBoundedText(
    value,
    maximum,
    Math.min(maximum + 1, Math.max(0, remaining)),
  );
  ledger.observed += scan.observed;
  ledger.scans.set(key, scan);
  return scan;
}

function isBoundedToken(value: unknown, maximum: number): value is string {
  if (typeof value !== "string") return false;
  const scan = scanBoundedText(value, maximum);
  return (
    scan.unicodeValid &&
    !scan.exceeded &&
    !scan.truncated &&
    scan.nonblank
  );
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isStableId(value: unknown, kind: StableIdKind): boolean {
  return typeof value === "string" && parseStableId(kind, value).ok;
}

function firstDurationShapeFailure(
  value: CapturedValue | undefined,
  path: readonly (string | number)[],
): DomainPath | null {
  const keyFailure = firstExactKeyFailure(
    value,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.beatDuration,
    path,
  );
  if (keyFailure !== null) return keyFailure;
  const record = recordValue(value);
  if (record === null) return immutablePath(path);
  if (!Number.isSafeInteger(scalarAt(record, "numerator"))) {
    return immutablePath([...path, "numerator"]);
  }
  if (!Number.isSafeInteger(scalarAt(record, "denominator"))) {
    return immutablePath([...path, "denominator"]);
  }
  return null;
}

function firstBoundaryShapeFailure(
  value: CapturedValue | undefined,
  path: readonly (string | number)[],
): DomainPath | null {
  const record = recordValue(value);
  if (record === null) return immutablePath(path);
  const kind = scalarAt(record, "kind");
  if (typeof kind !== "string") return immutablePath([...path, "kind"]);
  const sectionKinds = [
    "before-section",
    "after-section",
    "section-start",
    "section-end",
  ];
  const measureKinds = [
    "before-measure",
    "after-measure",
    "measure-start",
    "measure-end",
  ];
  const eventKinds = ["before-event", "after-event"];
  const idField = sectionKinds.includes(kind)
    ? "sectionId"
    : measureKinds.includes(kind)
      ? "measureId"
      : eventKinds.includes(kind)
        ? "eventId"
        : null;
  const keys =
    kind === "document-start" || kind === "document-end"
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.documentBoundary
      : idField === "sectionId"
        ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionBoundary
        : idField === "measureId"
          ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureBoundary
          : idField === "eventId"
            ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.eventBoundary
            : null;
  if (keys === null) return immutablePath([...path, "kind"]);
  const keyFailure = firstExactKeyFailure(record, keys, path);
  if (keyFailure !== null) return keyFailure;
  if (idField === null) return null;
  const idKind =
    idField === "sectionId"
      ? "section"
      : idField === "measureId"
        ? "measure"
        : "event";
  return isStableId(scalarAt(record, idField), idKind)
    ? null
    : immutablePath([...path, idField]);
}

function firstCompletionShapeFailure(
  value: CapturedValue | undefined,
  path: readonly (string | number)[],
  textScans: BoundedTextScanLedger,
): DomainPath | null {
  const declarations = arrayValue(value);
  if (declarations === null) return immutablePath(path);
  for (const [index, declarationValue] of declarations.values.entries()) {
    const rowPath = [...path, index];
    const declarationFailure = firstExactKeyFailure(
      declarationValue,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completionDeclaration,
      rowPath,
    );
    if (declarationFailure !== null) return declarationFailure;
    const declaration = recordValue(declarationValue);
    if (
      declaration === null ||
      !isStableId(scalarAt(declaration, "measureId"), "measure")
    ) {
      return immutablePath([...rowPath, "measureId"]);
    }
    const completionValue = valueAt(declaration, "completion");
    const completion = recordValue(completionValue);
    if (completion === null) {
      return immutablePath([...rowPath, "completion"]);
    }
    const kind = scalarAt(completion, "kind");
    if (typeof kind !== "string") {
      return immutablePath([...rowPath, "completion", "kind"]);
    }
    const completionKeys =
      kind === "empty"
        ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureCompletionEmpty
        : kind === "complete"
          ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureCompletionComplete
          : kind === "pickup" || kind === "incomplete"
            ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS
                .measureCompletionPickupOrIncomplete
            : null;
    if (completionKeys === null) {
      return immutablePath([...rowPath, "completion", "kind"]);
    }
    const completionPath = [...rowPath, "completion"];
    const completionFailure = firstExactKeyFailure(
      completion,
      completionKeys,
      completionPath,
    );
    if (completionFailure !== null) return completionFailure;
    if (kind === "pickup" || kind === "incomplete") {
      const durationFailure = firstDurationShapeFailure(
        valueAt(completion, "expectedDuration"),
        [...completionPath, "expectedDuration"],
      );
      if (durationFailure !== null) return durationFailure;
      const reason = scalarAt(completion, "reason");
      if (typeof reason !== "string") {
        return immutablePath([...completionPath, "reason"]);
      }
      const reasonScan = scanBoundedTextAtPath(
        textScans,
        [...completionPath, "reason"],
        reason,
        MAX_LONG_TEXT_CODE_POINTS,
      );
      if (
        !reasonScan.unicodeValid ||
        reasonScan.exceeded ||
        (!reasonScan.nonblank && !reasonScan.truncated)
      ) {
        return immutablePath([...completionPath, "reason"]);
      }
    }
  }
  return null;
}

function firstMetadataShapeFailure(
  value: CapturedValue | undefined,
  path: readonly (string | number)[],
  textScans: BoundedTextScanLedger,
): DomainPath | null {
  const keyFailure = firstExactKeyFailure(
    value,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionMetadata,
    path,
  );
  if (keyFailure !== null) return keyFailure;
  const metadata = recordValue(value);
  if (metadata === null) return immutablePath(path);
  const name = scalarAt(metadata, "name");
  if (typeof name !== "string") {
    return immutablePath([...path, "name"]);
  }
  const nameScan = scanBoundedTextAtPath(
    textScans,
    [...path, "name"],
    name,
    MAX_SHORT_TEXT_CODE_POINTS,
  );
  if (
    !nameScan.unicodeValid ||
    nameScan.exceeded ||
    (!nameScan.nonblank && !nameScan.truncated)
  ) {
    return immutablePath([...path, "name"]);
  }
  const annotation = scalarAt(metadata, "annotation");
  if (typeof annotation !== "string") {
    return immutablePath([...path, "annotation"]);
  }
  const annotationScan = scanBoundedTextAtPath(
    textScans,
    [...path, "annotation"],
    annotation,
    MAX_LONG_TEXT_CODE_POINTS,
  );
  if (!annotationScan.unicodeValid || annotationScan.exceeded) {
    return immutablePath([...path, "annotation"]);
  }
  const keyOverrideValue = valueAt(metadata, "keyOverride");
  if (scalarValue(keyOverrideValue) !== null) {
    const keyContextFailure = firstExactKeyFailure(
      keyOverrideValue,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.keyContext,
      [...path, "keyOverride"],
    );
    if (keyContextFailure !== null) return keyContextFailure;
    const keyContext = recordValue(keyOverrideValue);
    if (keyContext === null) {
      return immutablePath([...path, "keyOverride"]);
    }
    const tonicValue = valueAt(keyContext, "tonic");
    const tonicFailure = firstExactKeyFailure(
      tonicValue,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.spelledPitchClass,
      [...path, "keyOverride", "tonic"],
    );
    if (tonicFailure !== null) return tonicFailure;
    const tonic = recordValue(tonicValue);
    if (tonic === null) {
      return immutablePath([...path, "keyOverride", "tonic"]);
    }
    const step = scalarAt(tonic, "step");
    if (
      typeof step !== "string" ||
      !["A", "B", "C", "D", "E", "F", "G"].includes(step)
    ) {
      return immutablePath([...path, "keyOverride", "tonic", "step"]);
    }
    const alter = scalarAt(tonic, "alter");
    if (
      typeof alter !== "number" ||
      !Number.isInteger(alter) ||
      alter < -2 ||
      alter > 2
    ) {
      return immutablePath([...path, "keyOverride", "tonic", "alter"]);
    }
    const mode = scalarAt(keyContext, "mode");
    if (!KEY_MODES.some((candidate) => candidate === mode)) {
      return immutablePath([...path, "keyOverride", "mode"]);
    }
  }
  const boundary = scalarAt(metadata, "voiceLeadingBoundary");
  return SECTION_VOICE_LEADING_BOUNDARIES.some(
    (candidate) => candidate === boundary,
  )
    ? null
    : immutablePath([...path, "voiceLeadingBoundary"]);
}

function firstPlacementShapeFailure(
  value: CapturedValue | undefined,
  sourceKind: unknown,
  path: readonly (string | number)[],
  textScans: BoundedTextScanLedger,
): DomainPath | null {
  const placement = recordValue(value);
  if (placement === null) return immutablePath(path);
  const kind = scalarAt(placement, "kind");
  if (typeof kind !== "string") return immutablePath([...path, "kind"]);
  const keys =
    kind === "into-measure"
      ? sourceKind === "recovered-chord"
        ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS
            .recoveredChordIntoMeasurePlacement
        : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftIntoMeasurePlacement
      : kind === "into-section"
        ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.intoSectionPlacement
        : kind === "into-document"
          ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.intoDocumentPlacement
          : null;
  if (keys === null) return immutablePath([...path, "kind"]);
  const keyFailure = firstExactKeyFailure(placement, keys, path);
  if (keyFailure !== null) return keyFailure;

  const idFields =
    kind === "into-measure"
      ? ([
          ["measureId", "measure", true],
          ["beforeEventId", "event", false],
        ] as const)
      : kind === "into-section"
        ? ([
            ["sectionId", "section", true],
            ["beforeMeasureId", "measure", false],
          ] as const)
        : ([["beforeSectionId", "section", false]] as const);
  for (const [field, idKind, required] of idFields) {
    const id = scalarAt(placement, field);
    if (
      (required && !isStableId(id, idKind)) ||
      (!required && id !== null && !isStableId(id, idKind))
    ) {
      return immutablePath([...path, field]);
    }
  }

  const expectedLayout =
    kind === "into-measure"
      ? sourceKind === "recovered-chord"
        ? "insert-one-recovered-chord"
        : "flatten-one-implicit-measure"
      : kind === "into-section"
        ? "preserve-implicit-measures"
        : "preserve-named-sections";
  if (scalarAt(placement, "layoutDisposition") !== expectedLayout) {
    return immutablePath([...path, "layoutDisposition"]);
  }
  const completionFailure = firstCompletionShapeFailure(
    valueAt(placement, "completionDeclarations"),
    [...path, "completionDeclarations"],
    textScans,
  );
  if (completionFailure !== null) return completionFailure;

  if (kind === "into-document") {
    const declarations = arrayValue(valueAt(placement, "sectionDeclarations"));
    if (declarations === null) {
      return immutablePath([...path, "sectionDeclarations"]);
    }
    for (const [index, declarationValue] of declarations.values.entries()) {
      const rowPath = [...path, "sectionDeclarations", index];
      const rowFailure = firstExactKeyFailure(
        declarationValue,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionDeclaration,
        rowPath,
      );
      if (rowFailure !== null) return rowFailure;
      const declaration = recordValue(declarationValue);
      if (
        declaration === null ||
        !isNonnegativeSafeInteger(
          scalarAt(declaration, "sourceSectionOrdinal"),
        )
      ) {
        return immutablePath([...rowPath, "sourceSectionOrdinal"]);
      }
      const boundary = scalarAt(declaration, "voiceLeadingBoundary");
      if (
        !SECTION_VOICE_LEADING_BOUNDARIES.some(
          (candidate) => candidate === boundary,
        )
      ) {
        return immutablePath([...rowPath, "voiceLeadingBoundary"]);
      }
    }
  }
  return null;
}

function firstPlanShapeFailure(
  value: CapturedValue | undefined,
  textScans: BoundedTextScanLedger,
): DomainPath | null {
  const plan = recordValue(value);
  if (plan === null) return immutablePath(["plan"]);
  const kind = scalarAt(plan, "kind");
  if (typeof kind !== "string") return immutablePath(["plan", "kind"]);

  switch (kind) {
    case "insert-fragment": {
      const planFailure = firstExactKeyFailure(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftPlan,
        ["plan"],
      );
      if (planFailure !== null) return planFailure;
      const source = recordValue(valueAt(plan, "source"));
      if (source === null) return immutablePath(["plan", "source"]);
      const sourceKind = scalarAt(source, "kind");
      const complete = sourceKind === "complete-draft";
      const recovered = sourceKind === "recovered-chord";
      if (!complete && !recovered) {
        return immutablePath(["plan", "source", "kind"]);
      }
      const sourceFailure = firstExactKeyFailure(
        source,
        complete
          ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftSource
          : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.recoveredChordSource,
        ["plan", "source"],
      );
      if (sourceFailure !== null) return sourceFailure;
      const snapshotValue = valueAt(source, "quickEntrySnapshot");
      const snapshotFailure = firstExactKeyFailure(
        snapshotValue,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.quickEntrySnapshot,
        ["plan", "source", "quickEntrySnapshot"],
      );
      if (snapshotFailure !== null) return snapshotFailure;
      const snapshot = recordValue(snapshotValue);
      if (snapshot === null) {
        return immutablePath(["plan", "source", "quickEntrySnapshot"]);
      }
      const sourceText = scalarAt(snapshot, "sourceText");
      if (typeof sourceText !== "string") {
        return immutablePath([
          "plan",
          "source",
          "quickEntrySnapshot",
          "sourceText",
        ]);
      }
      if (!isNonnegativeSafeInteger(scalarAt(snapshot, "baseRevision"))) {
        return immutablePath([
          "plan",
          "source",
          "quickEntrySnapshot",
          "baseRevision",
        ]);
      }
      const boundaryFailure = firstBoundaryShapeFailure(
        valueAt(snapshot, "target"),
        ["plan", "source", "quickEntrySnapshot", "target"],
      );
      if (boundaryFailure !== null) return boundaryFailure;
      const issueCodes = arrayValue(valueAt(snapshot, "issueCodes"));
      if (issueCodes === null) {
        return immutablePath([
          "plan",
          "source",
          "quickEntrySnapshot",
          "issueCodes",
        ]);
      }
      const observedIssueCodes: string[] = [];
      for (const issueValue of issueCodes.values) {
        const issue = scalarValue(issueValue);
        if (!isBoundedToken(issue, MAX_COMMAND_ID_CODE_POINTS)) {
          return immutablePath([
            "plan",
            "source",
            "quickEntrySnapshot",
            "issueCodes",
          ]);
        }
        observedIssueCodes.push(issue);
      }
      if (new Set(observedIssueCodes).size !== observedIssueCodes.length) {
        return immutablePath([
          "plan",
          "source",
          "quickEntrySnapshot",
          "issueCodes",
        ]);
      }
      const expectedStatus = scalarAt(snapshot, "expectedStatus");
      if (
        !["idle", "invalid", "ready"].some(
          (candidate) => candidate === expectedStatus,
        )
      ) {
        return immutablePath([
          "plan",
          "source",
          "quickEntrySnapshot",
          "expectedStatus",
        ]);
      }
      const expectedLane = scalarAt(snapshot, "expectedLane");
      if (
        !["complete-draft", "recovered-chord"].some(
          (candidate) => candidate === expectedLane,
        )
      ) {
        return immutablePath([
          "plan",
          "source",
          "quickEntrySnapshot",
          "expectedLane",
        ]);
      }

      if (complete) {
        const acknowledgements = arrayValue(
          valueAt(source, "warningAcknowledgements"),
        );
        if (acknowledgements === null) {
          return immutablePath([
            "plan",
            "source",
            "warningAcknowledgements",
          ]);
        }
        for (const [index, rowValue] of acknowledgements.values.entries()) {
          const rowPath = [
            "plan",
            "source",
            "warningAcknowledgements",
            index,
          ];
          const rowFailure = firstExactKeyFailure(
            rowValue,
            A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.warningAcknowledgement,
            rowPath,
          );
          if (rowFailure !== null) return rowFailure;
          const row = recordValue(rowValue);
          if (
            row === null ||
            !isBoundedToken(
              scalarAt(row, "code"),
              MAX_COMMAND_ID_CODE_POINTS,
            )
          ) {
            return immutablePath([...rowPath, "code"]);
          }
          const rangeValue = valueAt(row, "range");
          const rangeFailure = firstExactKeyFailure(
            rangeValue,
            A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sourceRange,
            [...rowPath, "range"],
          );
          if (rangeFailure !== null) return rangeFailure;
          const range = recordValue(rangeValue);
          const start = range === null ? undefined : scalarAt(range, "start");
          const end = range === null ? undefined : scalarAt(range, "end");
          if (
            !isNonnegativeSafeInteger(start) ||
            !isNonnegativeSafeInteger(end) ||
            start > end ||
            end > sourceText.length
          ) {
            return immutablePath([...rowPath, "range"]);
          }
        }
      } else {
        if (
          !isNonnegativeSafeInteger(
            scalarAt(source, "selectedGlobalOrdinal"),
          )
        ) {
          return immutablePath([
            "plan",
            "source",
            "selectedGlobalOrdinal",
          ]);
        }
        const acknowledgement = scalarAt(
          source,
          "layoutLossAcknowledgement",
        );
        if (typeof acknowledgement !== "string") {
          return immutablePath([
            "plan",
            "source",
            "layoutLossAcknowledgement",
          ]);
        }
        const acknowledgementScan = scanBoundedText(
          acknowledgement,
          MAX_COMMAND_ID_CODE_POINTS,
        );
        if (
          !acknowledgementScan.unicodeValid ||
          acknowledgementScan.exceeded
        ) {
          return immutablePath([
            "plan",
            "source",
            "layoutLossAcknowledgement",
          ]);
        }
        const callerDuration = valueAt(source, "callerDuration");
        if (scalarValue(callerDuration) !== null) {
          const durationFailure = firstDurationShapeFailure(
            callerDuration,
            ["plan", "source", "callerDuration"],
          );
          if (durationFailure !== null) return durationFailure;
        }
      }

      const placementFailure = firstPlacementShapeFailure(
        valueAt(plan, "placement"),
        sourceKind,
        ["plan", "placement"],
        textScans,
      );
      if (placementFailure !== null) return placementFailure;
      return scalarAt(plan, "voicingPolicy") === A0_U1_NEW_EVENT_POLICY_ID
        ? null
        : immutablePath(["plan", "voicingPolicy"]);
    }
    case "split-event-duration": {
      const keyFailure = firstExactKeyFailure(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitEventDurationPlan,
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(scalarAt(plan, "eventId"), "event")) {
        return immutablePath(["plan", "eventId"]);
      }
      for (const field of ["firstDuration", "secondDuration"]) {
        const durationFailure = firstDurationShapeFailure(
          valueAt(plan, field),
          ["plan", field],
        );
        if (durationFailure !== null) return durationFailure;
      }
      const completionFailure = firstCompletionShapeFailure(
        valueAt(plan, "completionDeclarations"),
        ["plan", "completionDeclarations"],
        textScans,
      );
      if (completionFailure !== null) return completionFailure;
      if (
        scalarAt(plan, "identityPolicy") !==
        "retain-source-first-allocate-second"
      ) {
        return immutablePath(["plan", "identityPolicy"]);
      }
      if (
        scalarAt(plan, "contentPolicy") !==
        "copy-exact-chord-and-voicing"
      ) {
        return immutablePath(["plan", "contentPolicy"]);
      }
      return scalarAt(plan, "annotationPolicy") ===
        "retain-source-first-clear-second"
        ? null
        : immutablePath(["plan", "annotationPolicy"]);
    }
    case "join-event-durations": {
      const keyFailure = firstExactKeyFailure(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinEventDurationsPlan,
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(scalarAt(plan, "leftEventId"), "event")) {
        return immutablePath(["plan", "leftEventId"]);
      }
      if (!isStableId(scalarAt(plan, "rightEventId"), "event")) {
        return immutablePath(["plan", "rightEventId"]);
      }
      const durationFailure = firstDurationShapeFailure(
        valueAt(plan, "joinedDuration"),
        ["plan", "joinedDuration"],
      );
      if (durationFailure !== null) return durationFailure;
      const completionFailure = firstCompletionShapeFailure(
        valueAt(plan, "completionDeclarations"),
        ["plan", "completionDeclarations"],
        textScans,
      );
      if (completionFailure !== null) return completionFailure;
      if (scalarAt(plan, "identityPolicy") !== "retain-left-remove-right") {
        return immutablePath(["plan", "identityPolicy"]);
      }
      if (
        scalarAt(plan, "contentPolicy") !==
        "require-exact-chord-and-voicing"
      ) {
        return immutablePath(["plan", "contentPolicy"]);
      }
      return scalarAt(plan, "annotationPolicy") ===
        "require-right-empty-retain-left"
        ? null
        : immutablePath(["plan", "annotationPolicy"]);
    }
    case "split-section": {
      const keyFailure = firstExactKeyFailure(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitSectionPlan,
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(scalarAt(plan, "sectionId"), "section")) {
        return immutablePath(["plan", "sectionId"]);
      }
      if (!isStableId(scalarAt(plan, "beforeMeasureId"), "measure")) {
        return immutablePath(["plan", "beforeMeasureId"]);
      }
      const metadataFailure = firstMetadataShapeFailure(
        valueAt(plan, "newSectionMetadata"),
        ["plan", "newSectionMetadata"],
        textScans,
      );
      if (metadataFailure !== null) return metadataFailure;
      const completionFailure = firstCompletionShapeFailure(
        valueAt(plan, "completionDeclarations"),
        ["plan", "completionDeclarations"],
        textScans,
      );
      if (completionFailure !== null) return completionFailure;
      if (
        scalarAt(plan, "identityPolicy") !==
        "retain-source-prefix-allocate-suffix"
      ) {
        return immutablePath(["plan", "identityPolicy"]);
      }
      return scalarAt(plan, "measurePolicy") ===
        "move-suffix-preserve-identities"
        ? null
        : immutablePath(["plan", "measurePolicy"]);
    }
    case "join-sections": {
      const keyFailure = firstExactKeyFailure(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinSectionsPlan,
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(scalarAt(plan, "leftSectionId"), "section")) {
        return immutablePath(["plan", "leftSectionId"]);
      }
      if (!isStableId(scalarAt(plan, "rightSectionId"), "section")) {
        return immutablePath(["plan", "rightSectionId"]);
      }
      for (const field of [
        "expectedLeftMetadata",
        "expectedRightMetadata",
        "resultMetadata",
      ]) {
        const metadataFailure = firstMetadataShapeFailure(
          valueAt(plan, field),
          ["plan", field],
          textScans,
        );
        if (metadataFailure !== null) return metadataFailure;
      }
      const completionFailure = firstCompletionShapeFailure(
        valueAt(plan, "completionDeclarations"),
        ["plan", "completionDeclarations"],
        textScans,
      );
      if (completionFailure !== null) return completionFailure;
      if (scalarAt(plan, "identityPolicy") !== "retain-left-remove-right") {
        return immutablePath(["plan", "identityPolicy"]);
      }
      if (
        scalarAt(plan, "measurePolicy") !==
        "left-then-right-preserve-identities"
      ) {
        return immutablePath(["plan", "measurePolicy"]);
      }
      if (
        scalarAt(plan, "metadataPolicy") !==
        "compare-both-then-apply-explicit-result"
      ) {
        return immutablePath(["plan", "metadataPolicy"]);
      }
      return scalarAt(plan, "internalBoundaryPolicy") ===
        "remove-right-entry-boundary-confirmed"
        ? null
        : immutablePath(["plan", "internalBoundaryPolicy"]);
    }
    default:
      return immutablePath(["plan", "kind"]);
  }
}

function metadataWorkThroughPath(
  command: CapturedRecord,
  stopPath: DomainPath | null,
  textScans: BoundedTextScanLedger,
): AtomicEditPlanRuntimeShapeWork {
  const plan = recordValue(valueAt(command, "plan"));
  if (plan === null) {
    return Object.freeze({
      planNodesVisited: 1,
      metadataFieldsCompared: 0,
      metadataCodePointsObserved: 0,
      peakPlanNodeRecords: 1,
    });
  }
  if (
    stopPath !== null &&
    stopPath[0] === "plan" &&
    (stopPath.length === 1 ||
      (stopPath.length === 2 &&
        typeof stopPath[1] === "string" &&
        propertyAt(plan, stopPath[1]) === undefined))
  ) {
    return Object.freeze({
      planNodesVisited: 1,
      metadataFieldsCompared: 0,
      metadataCodePointsObserved: 0,
      peakPlanNodeRecords: 1,
    });
  }

  const kind = scalarAt(plan, "kind");
  const metadataRoots =
    kind === "split-section"
      ? ["newSectionMetadata"]
      : kind === "join-sections"
        ? [
            "expectedLeftMetadata",
            "expectedRightMetadata",
            "resultMetadata",
          ]
        : [];
  const topLevelOrder: readonly string[] =
    kind === "insert-fragment"
      ? ["kind", "source", "placement", "voicingPolicy"]
      : kind === "split-event-duration"
        ? [
            "kind",
            "eventId",
            "firstDuration",
            "secondDuration",
            "completionDeclarations",
            "identityPolicy",
            "contentPolicy",
            "annotationPolicy",
          ]
        : kind === "join-event-durations"
          ? [
              "kind",
              "leftEventId",
              "rightEventId",
              "joinedDuration",
              "completionDeclarations",
              "identityPolicy",
              "contentPolicy",
              "annotationPolicy",
            ]
          : kind === "split-section"
            ? [
                "kind",
                "sectionId",
                "beforeMeasureId",
                "newSectionMetadata",
                "completionDeclarations",
                "identityPolicy",
                "measurePolicy",
              ]
            : [
                "kind",
                "leftSectionId",
                "rightSectionId",
                "expectedLeftMetadata",
                "expectedRightMetadata",
                "resultMetadata",
                "completionDeclarations",
                "identityPolicy",
                "measurePolicy",
                "metadataPolicy",
                "internalBoundaryPolicy",
              ];
  const stopTop =
    typeof stopPath?.[1] === "string" ? stopPath[1] : null;
  const stopTopIndex =
    stopTop === null
      ? Number.POSITIVE_INFINITY
      : topLevelOrder.indexOf(stopTop);
  let fieldsCompared = 0;
  let codePointsObserved = 0;

  for (const root of metadataRoots) {
    const rootIndex = topLevelOrder.indexOf(root);
    if (stopTopIndex < rootIndex) break;
    if (stopTop === root && stopPath?.length === 2) break;
    const metadata = recordValue(valueAt(plan, root));
    if (metadata === null) break;
    const fieldOrder = [
      "name",
      "annotation",
      "keyOverride",
      "voiceLeadingBoundary",
    ] as const;
    const stopField =
      stopTop === root && typeof stopPath?.[2] === "string"
        ? stopPath[2]
        : null;
    for (const field of fieldOrder) {
      if (
        stopField !== null &&
        fieldOrder.indexOf(field) >
          fieldOrder.indexOf(
            stopField === "name" ||
              stopField === "annotation" ||
              stopField === "keyOverride" ||
              stopField === "voiceLeadingBoundary"
              ? stopField
              : "name",
          )
      ) {
        break;
      }
      fieldsCompared += 1;
      if (field === "name" || field === "annotation") {
        const maximum =
          field === "name"
            ? MAX_SHORT_TEXT_CODE_POINTS
            : MAX_LONG_TEXT_CODE_POINTS;
        const text = scalarAt(metadata, field);
        if (typeof text !== "string") {
          return Object.freeze({
            planNodesVisited: 1,
            metadataFieldsCompared: fieldsCompared,
            metadataCodePointsObserved: codePointsObserved,
            peakPlanNodeRecords: 1,
          });
        }
        const textScan = scanBoundedTextAtPath(
          textScans,
          ["plan", root, field],
          text,
          maximum,
        );
        codePointsObserved = Math.min(
          MAX_A0_U1_METADATA_CODE_POINTS_OBSERVED,
          codePointsObserved + textScan.observed,
        );
        if (
          !textScan.unicodeValid ||
          textScan.exceeded ||
          (field === "name" &&
            !textScan.nonblank &&
            !textScan.truncated)
        ) {
          return Object.freeze({
            planNodesVisited: 1,
            metadataFieldsCompared: fieldsCompared,
            metadataCodePointsObserved: codePointsObserved,
            peakPlanNodeRecords: 1,
          });
        }
      }
      if (stopField === field) {
        return Object.freeze({
          planNodesVisited: 1,
          metadataFieldsCompared: fieldsCompared,
          metadataCodePointsObserved: codePointsObserved,
          peakPlanNodeRecords: 1,
        });
      }
    }
  }

  const completionTopIndex =
    kind === "insert-fragment"
      ? topLevelOrder.indexOf("placement")
      : topLevelOrder.indexOf("completionDeclarations");
  const stopIsInsideCompletion =
    stopTop === "completionDeclarations" ||
    (stopTop === "placement" &&
      stopPath?.includes("completionDeclarations") === true);
  const completionReached =
    stopPath === null ||
    stopTopIndex > completionTopIndex ||
    stopIsInsideCompletion;
  if (completionReached) {
    const completionPath =
      kind === "insert-fragment"
        ? ["plan", "placement", "completionDeclarations"]
        : ["plan", "completionDeclarations"];
    const completionValue =
      kind === "insert-fragment"
        ? valueAt(
            recordValue(valueAt(plan, "placement")) ??
              Object.freeze({
                kind: "record",
                prototypeValid: true,
                properties: Object.freeze([]),
              }),
            "completionDeclarations",
          )
        : valueAt(plan, "completionDeclarations");
    const declarations = arrayValue(completionValue);
    if (declarations !== null) {
      for (const [index, declarationValue] of declarations.values.entries()) {
        const declaration = recordValue(declarationValue);
        const completion =
          declaration === null
            ? null
            : recordValue(valueAt(declaration, "completion"));
        if (completion === null) continue;
        const completionKind = scalarAt(completion, "kind");
        if (
          completionKind !== "pickup" &&
          completionKind !== "incomplete"
        ) {
          continue;
        }
        if (
          stopIsInsideCompletion &&
          stopPath !== null &&
          !stopPath.includes("reason")
        ) {
          break;
        }
        const reason = scalarAt(completion, "reason");
        if (typeof reason !== "string") break;
        const reasonScan = scanBoundedTextAtPath(
          textScans,
          [...completionPath, index, "completion", "reason"],
          reason,
          MAX_LONG_TEXT_CODE_POINTS,
        );
        codePointsObserved = Math.min(
          MAX_A0_U1_METADATA_CODE_POINTS_OBSERVED,
          codePointsObserved + reasonScan.observed,
        );
        if (
          !reasonScan.unicodeValid ||
          reasonScan.exceeded ||
          (!reasonScan.nonblank && !reasonScan.truncated)
        ) {
          break;
        }
        const stopIndex = stopPath?.find(
          (segment): segment is number => typeof segment === "number",
        );
        if (stopIsInsideCompletion && stopIndex === index) break;
      }
    }
  }
  return Object.freeze({
    planNodesVisited: 1,
    metadataFieldsCompared: fieldsCompared,
    metadataCodePointsObserved: codePointsObserved,
    peakPlanNodeRecords: 1,
  });
}

function materializeCaptured(value: CapturedValue): unknown {
  switch (value.kind) {
    case "scalar":
      return value.value;
    case "invalid":
      return undefined;
    case "array":
      return Object.freeze(value.values.map(materializeCaptured));
    case "record": {
      const materialized: Record<string, unknown> = {};
      for (const property of value.properties) {
        if (
          typeof property.key === "string" &&
          property.data &&
          property.enumerable
        ) {
          materialized[property.key] = materializeCaptured(property.value);
        }
      }
      return Object.freeze(materialized);
    }
  }
}

function boundedTextFailureEvidence(
  textScans: BoundedTextScanLedger,
  path: DomainPath,
): Readonly<{ observed: number; maximum: number }> | null {
  const scan = textScans.scans.get(textScanKey(path));
  return scan?.exceeded === true
    ? Object.freeze({
        observed: scan.observed,
        maximum: scan.maximum,
      })
    : null;
}

function failureResult(
  code: ShapeRefusalCode,
  path: DomainPath,
  shapeWork: AtomicEditPlanRuntimeShapeWork,
  evidence: Readonly<{
    observed: number;
    maximum: number;
  }> | null = null,
): AtomicEditPlanRuntimeShapeDecodeResult {
  return Object.freeze({
    ok: false,
    code,
    path,
    shapeWork,
    ...(evidence ?? {}),
  });
}

/**
 * Capture and validate one untrusted apply-edit-plan value without invoking
 * property accessors. The successful value is a fresh, recursively frozen
 * copy; no caller-owned object or array is retained.
 *
 * Envelope scalar policy (token bounds, revision freshness, and logical-time
 * validity) remains at the inherited A0 envelope stage. This decoder checks
 * their primitive runtime types only so the returned command can be read
 * safely by that stage.
 */
export function decodeAtomicEditPlanRuntimeShape(
  commandValue: unknown,
): AtomicEditPlanRuntimeShapeDecodeResult {
  const captured = capturePassiveData(
    commandValue,
    [],
    { active: new WeakSet(), recordsObserved: 0 },
    0,
  );
  if (!captured.ok) {
    const code =
      captured.path[0] === "plan"
        ? "edit-plan.plan-shape-invalid"
        : "edit-plan.command-shape-invalid";
    const shapeWork = Object.freeze({
      planNodesVisited: 1,
      metadataFieldsCompared: 0,
      metadataCodePointsObserved: 0,
      peakPlanNodeRecords: 1,
    });
    return failureResult(code, captured.path, shapeWork);
  }

  const envelopeFailure = firstExactKeyFailure(
    captured.value,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.envelope,
    [],
  );
  const envelope = recordValue(captured.value);
  if (envelopeFailure !== null || envelope === null) {
    const path = envelopeFailure ?? immutablePath([]);
    return failureResult(
      "edit-plan.command-shape-invalid",
      path,
      Object.freeze({
        planNodesVisited: 1,
        metadataFieldsCompared: 0,
        metadataCodePointsObserved: 0,
        peakPlanNodeRecords: 1,
      }),
    );
  }

  for (const field of ["id", "label", "expectedDocumentId"]) {
    if (typeof scalarAt(envelope, field) !== "string") {
      return failureResult(
        "edit-plan.command-shape-invalid",
        immutablePath([field]),
        Object.freeze({
          planNodesVisited: 1,
          metadataFieldsCompared: 0,
          metadataCodePointsObserved: 0,
          peakPlanNodeRecords: 1,
        }),
      );
    }
  }
  for (const field of ["expectedRevision", "logicalTimeMs"]) {
    if (typeof scalarAt(envelope, field) !== "number") {
      return failureResult(
        "edit-plan.command-shape-invalid",
        immutablePath([field]),
        Object.freeze({
          planNodesVisited: 1,
          metadataFieldsCompared: 0,
          metadataCodePointsObserved: 0,
          peakPlanNodeRecords: 1,
        }),
      );
    }
  }
  if (scalarAt(envelope, "coalescing") !== null) {
    return failureResult(
      "edit-plan.command-shape-invalid",
      immutablePath(["coalescing"]),
      Object.freeze({
        planNodesVisited: 1,
        metadataFieldsCompared: 0,
        metadataCodePointsObserved: 0,
        peakPlanNodeRecords: 1,
      }),
    );
  }
  if (scalarAt(envelope, "kind") !== "apply-edit-plan") {
    return failureResult(
      "edit-plan.command-shape-invalid",
      immutablePath(["kind"]),
      Object.freeze({
        planNodesVisited: 1,
        metadataFieldsCompared: 0,
        metadataCodePointsObserved: 0,
        peakPlanNodeRecords: 1,
      }),
    );
  }

  const textScans: BoundedTextScanLedger = {
    scans: new Map(),
    observed: 0,
  };
  const planFailure = firstPlanShapeFailure(
    valueAt(envelope, "plan"),
    textScans,
  );
  const shapeWork = metadataWorkThroughPath(
    envelope,
    planFailure,
    textScans,
  );
  if (planFailure !== null) {
    return failureResult(
      "edit-plan.plan-shape-invalid",
      planFailure,
      shapeWork,
      boundedTextFailureEvidence(textScans, planFailure),
    );
  }

  const materialized = materializeCaptured(captured.value);
  /*
   * The exhaustive descriptor and value checks above are the runtime
   * constructor for this additive command. Tuple cardinality and correlated
   * lane declarations intentionally remain later edit-plan laws, so the
   * materialized arrays preserve their exact caller cardinality.
   */
  const value = materialized as ApplyEditPlanCommand;
  return Object.freeze({ ok: true, value, shapeWork });
}
