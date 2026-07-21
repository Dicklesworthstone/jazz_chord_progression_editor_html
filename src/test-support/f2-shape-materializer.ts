import {
  applyFixtureActivation,
  applyFixtureMutation,
  applyFixtureMutations,
  createHarnessObservations,
  expectedIssuesFrom,
  expectedOkFrom,
  fixturePath,
  isFixtureRecord,
  materializeFixtureValue,
  ownFixtureValue,
  requireFixtureArray,
  requireFixtureBoolean,
  requireFixtureNumber,
  requireFixtureRecord,
  requireFixtureString,
  setFixturePath,
  stableCellId,
  valueAtPath,
  type ExpectedIssue,
  type FixturePath,
  type FixtureRecord,
  type HarnessObservationCounters,
  type MaterializedFixtureCell,
} from "./f2-fixture-core";

type ShapeSources = Readonly<{
  manifest: FixtureRecord;
  shape: FixtureRecord;
}>;

type InputBuilder = (
  root: unknown,
  observations: HarnessObservationCounters,
) => unknown;

type CellOptions = Readonly<{
  expectedIssues?: readonly ExpectedIssue[];
  expectedOk?: boolean;
  expectedEvidence?: FixtureRecord;
  template?: string;
  operation?: "decodeDocumentShape" | "preflightDocumentImportBytes";
  label?: string;
  verify?: (input: unknown, result: unknown) => void;
}>;

const REPRESENTATIVE_EVENT_PATH = [
  "sections",
  0,
  "measures",
  0,
  "events",
  0,
] as const;
const REPRESENTATIVE_MEASURE_PATH = ["sections", 0, "measures", 0] as const;
const REPRESENTATIVE_SECTION_PATH = ["sections", 0] as const;

const DECODER_EVIDENCE_KEYS = Object.freeze([
  "bytesObserved",
  "maxDepthObserved",
  "recordsInspected",
  "arraysInspected",
  "scalarFieldsInspected",
  "descriptorReads",
  "arraySlotsRead",
  "collectionLengthsObserved",
  "sectionSlotsObserved",
  "maxMeasuresPerSectionObserved",
  "eventSlotsObserved",
  "maxPitchArraySlotsObserved",
  "sectionElementsSemanticallyDecoded",
  "measureElementsSemanticallyDecoded",
  "eventValuesSemanticallyDecoded",
  "pitchElementsSemanticallyDecoded",
  "sectionElementsCopied",
  "measureElementsCopied",
  "eventValuesCopied",
  "pitchElementsCopied",
  "candidateObjectsAllocated",
  "candidateArraysAllocated",
  "diagnosticCandidatesProduced",
  "idOccurrences",
  "idClusters",
  "idDuplicateWorkUnits",
  "timelineAdditions",
  "timelineTicksObserved",
] as const);

function expectedEvidenceFrom(value: FixtureRecord): FixtureRecord | undefined {
  const expectedValue = ownFixtureValue(value, "expected");
  const expected = isFixtureRecord(expectedValue) ? expectedValue : value;
  const result: Record<string, unknown> = {};
  for (const key of DECODER_EVIDENCE_KEYS) {
    const counter = ownFixtureValue(expected, key);
    if (typeof counter === "number") result[key] = counter;
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function parseSources(manifestValue: unknown, shapeValue: unknown): ShapeSources {
  return {
    manifest: requireFixtureRecord(manifestValue, "F2 manifest"),
    shape: requireFixtureRecord(shapeValue, "F2 shape cases"),
  };
}

function templatesOf(sources: ShapeSources): FixtureRecord {
  return requireFixtureRecord(ownFixtureValue(sources.shape, "templates"), "templates");
}

function fragmentsOf(sources: ShapeSources): FixtureRecord {
  return requireFixtureRecord(
    ownFixtureValue(sources.shape, "branchFragments"),
    "branchFragments",
  );
}

function activationsOf(sources: ShapeSources): FixtureRecord {
  return requireFixtureRecord(
    ownFixtureValue(sources.shape, "activationProtocol"),
    "activationProtocol",
  );
}

function freshTemplate(
  sources: ShapeSources,
  name: string,
  observations: HarnessObservationCounters,
): unknown {
  const source = ownFixtureValue(templatesOf(sources), name);
  if (source === undefined) throw new Error(`F2_TEMPLATE_MISSING:${name}`);
  return materializeFixtureValue(source, observations);
}

function optionFields(options: CellOptions): Omit<MaterializedFixtureCell, "caseId" | "cellId" | "createInput"> {
  return {
    operation: options.operation ?? "decodeDocumentShape",
    ...(options.expectedIssues === undefined
      ? {}
      : { expectedIssues: options.expectedIssues }),
    ...(options.expectedOk === undefined ? {} : { expectedOk: options.expectedOk }),
    ...(options.expectedEvidence === undefined
      ? {}
      : { expectedEvidence: options.expectedEvidence }),
    ...(options.verify === undefined ? {} : { verify: options.verify }),
  };
}

function makeCell(
  sources: ShapeSources,
  caseId: string,
  index: number,
  builder: InputBuilder,
  options: CellOptions = {},
): MaterializedFixtureCell {
  return {
    caseId,
    cellId: stableCellId(caseId, index, options.label),
    ...optionFields(options),
    createInput: () => {
      const observations = createHarnessObservations();
      const root = options.operation === "preflightDocumentImportBytes"
        ? undefined
        : freshTemplate(sources, options.template ?? "representativeDocument", observations);
      return { input: builder(root, observations), observations };
    },
  };
}

function activationNames(cell: FixtureRecord): readonly string[] {
  const result: string[] = [];
  const activation = ownFixtureValue(cell, "activation");
  if (typeof activation === "string") result.push(activation);
  const activations = ownFixtureValue(cell, "activations");
  if (Array.isArray(activations)) {
    for (const entry of activations) result.push(requireFixtureString(entry, "activation"));
  }
  return result;
}

function applyActivations(
  sources: ShapeSources,
  root: unknown,
  names: readonly string[],
  observations: HarnessObservationCounters,
): void {
  for (const name of names) {
    applyFixtureActivation(
      root,
      name,
      observations,
      activationsOf(sources),
      fragmentsOf(sources),
    );
  }
}

function pathForCell(caseRecord: FixtureRecord, cell: FixtureRecord): FixturePath | undefined {
  const target = ownFixtureValue(cell, "target");
  if (Array.isArray(target)) return fixturePath(target, "cell.target");
  const path = ownFixtureValue(cell, "path");
  if (Array.isArray(path)) return fixturePath(path, "cell.path");
  const suffix = ownFixtureValue(cell, "pathSuffix");
  if (Array.isArray(suffix)) {
    return [
      ...fixturePath(ownFixtureValue(caseRecord, "pathPrefix"), "case.pathPrefix"),
      ...fixturePath(suffix, "cell.pathSuffix"),
    ];
  }
  return undefined;
}

function applyBareCell(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
  cell: FixtureRecord,
  root: unknown,
  observations: HarnessObservationCounters,
): unknown {
  const preMutations = ownFixtureValue(cell, "preMutations");
  if (Array.isArray(preMutations)) {
    applyFixtureMutations(root, preMutations, observations, fragmentsOf(sources));
  }
  applyActivations(sources, root, activationNames(cell), observations);
  const mutation = ownFixtureValue(cell, "mutation");
  if (isFixtureRecord(mutation)) {
    applyFixtureMutation(root, mutation, observations, fragmentsOf(sources));
  }
  const mutations = ownFixtureValue(cell, "mutations");
  if (Array.isArray(mutations)) {
    applyFixtureMutations(root, mutations, observations, fragmentsOf(sources));
  }
  const path = pathForCell(caseRecord, cell);
  if (path !== undefined &&
      (Object.hasOwn(cell, "value") || Object.hasOwn(cell, "descriptor"))) {
    const fixtureValue = Object.hasOwn(cell, "descriptor")
      ? ownFixtureValue(cell, "descriptor")
      : ownFixtureValue(cell, "value");
    setFixturePath(
      root,
      path,
      materializeFixtureValue(fixtureValue, observations),
    );
  }
  return root;
}

function cellOptionsFrom(
  cell: FixtureRecord,
  fallback: FixtureRecord | undefined,
  overrides: CellOptions = {},
): CellOptions {
  const cellIssues = expectedIssuesFrom(cell);
  const fallbackIssues = fallback === undefined ? undefined : expectedIssuesFrom(fallback);
  const cellOk = expectedOkFrom(cell);
  const fallbackOk = fallback === undefined ? undefined : expectedOkFrom(fallback);
  const cellEvidence = expectedEvidenceFrom(cell);
  const fallbackEvidence = fallback === undefined
    ? undefined
    : expectedEvidenceFrom(fallback);
  const labelValue = ownFixtureValue(cell, "id");
  const selectedIssues = cellIssues ?? fallbackIssues;
  const selectedOk = cellOk ?? fallbackOk;
  const selectedEvidence = cellEvidence ?? fallbackEvidence;
  return {
    ...(selectedIssues === undefined ? {} : { expectedIssues: selectedIssues }),
    ...(selectedOk === undefined ? {} : { expectedOk: selectedOk }),
    ...(selectedEvidence === undefined ? {} : { expectedEvidence: selectedEvidence }),
    ...(typeof labelValue === "string" ? { label: labelValue } : {}),
    ...overrides,
  };
}

function caseById(sources: ShapeSources): ReadonlyMap<string, FixtureRecord> {
  const result = new Map<string, FixtureRecord>();
  for (const value of requireFixtureArray(ownFixtureValue(sources.shape, "cases"), "cases")) {
    const record = requireFixtureRecord(value, "shape case");
    const id = requireFixtureString(ownFixtureValue(record, "id"), "shape case id");
    result.set(id, record);
  }
  return result;
}

function expectedSingle(code: string, path: FixturePath): readonly ExpectedIssue[] {
  return [{ code, path }];
}

function expandBareList(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
  sourceName: string,
  startIndex = 0,
  fallbackExpected?: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = requireFixtureString(ownFixtureValue(caseRecord, "id"), "case.id");
  const result: MaterializedFixtureCell[] = [];
  let index = startIndex;
  for (const value of requireFixtureArray(ownFixtureValue(caseRecord, sourceName), sourceName)) {
    const cell = requireFixtureRecord(value, `${caseId}.${sourceName}`);
    const values = ownFixtureValue(cell, "values");
    const expansions = Array.isArray(values) ? values : [ownFixtureValue(cell, "value")];
    for (const expandedValue of expansions) {
      const expanded: FixtureRecord = Array.isArray(values)
        ? { ...cell, value: expandedValue }
        : cell;
      result.push(makeCell(
        sources,
        caseId,
        index,
        (root, observations) => applyBareCell(
          sources,
          caseRecord,
          expanded,
          root,
          observations,
        ),
        cellOptionsFrom(expanded, fallbackExpected),
      ));
      index += 1;
    }
  }
  return result;
}

function singularCase(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
  builder?: InputBuilder,
): readonly MaterializedFixtureCell[] {
  const caseId = requireFixtureString(ownFixtureValue(caseRecord, "id"), "case.id");
  const template = typeof ownFixtureValue(caseRecord, "template") === "string"
    ? requireFixtureString(ownFixtureValue(caseRecord, "template"), "template")
    : "representativeDocument";
  return [makeCell(
    sources,
    caseId,
    0,
    builder ?? ((root, observations) => applyBareCell(
      sources,
      caseRecord,
      caseRecord,
      root,
      observations,
    )),
    cellOptionsFrom(caseRecord, undefined, { template }),
  )];
}

function expandChordAccepted(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-CHORD-001";
  const matrix = requireFixtureRecord(ownFixtureValue(caseRecord, "matrix"), `${caseId}.matrix`);
  const expansion = requireFixtureRecord(
    ownFixtureValue(caseRecord, "cellExpansion"),
    `${caseId}.cellExpansion`,
  );
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  const scalarAxes = requireFixtureArray(ownFixtureValue(expansion, "scalarAxes"), "scalarAxes");
  for (const axisValue of scalarAxes) {
    const axis = requireFixtureRecord(axisValue, "scalar axis");
    const source = requireFixtureString(ownFixtureValue(axis, "source"), "axis.source");
    const path = fixturePath(ownFixtureValue(axis, "target"), "axis.target");
    for (const value of requireFixtureArray(ownFixtureValue(matrix, source), source)) {
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        setFixturePath(root, path, materializeFixtureValue(value, observations));
        return root;
      }, { expectedOk: true, label: `${source}:${String(value)}` }));
      index += 1;
    }
  }
  const degreeAxes = requireFixtureArray(ownFixtureValue(expansion, "degreeAxes"), "degreeAxes");
  for (const axisValue of degreeAxes) {
    const axis = requireFixtureRecord(axisValue, "degree axis");
    const source = requireFixtureString(ownFixtureValue(axis, "source"), "axis.source");
    const path = fixturePath(ownFixtureValue(axis, "target"), "axis.target");
    for (const value of requireFixtureArray(ownFixtureValue(matrix, source), source)) {
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        setFixturePath(root, path, [materializeFixtureValue(value, observations)]);
        return root;
      }, { expectedOk: true, label: source }));
      index += 1;
    }
  }
  const degreeAlterAxes = requireFixtureArray(
    ownFixtureValue(expansion, "degreeAlterAxes"),
    "degreeAlterAxes",
  );
  for (const axisValue of degreeAlterAxes) {
    const axis = requireFixtureRecord(axisValue, "degree alter axis");
    const path = fixturePath(ownFixtureValue(axis, "target"), "axis.target");
    const isSixth = path[path.length - 1] === "sixth";
    for (const value of requireFixtureArray(ownFixtureValue(matrix, "degreeAlters"), "degreeAlters")) {
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        const degree = materializeFixtureValue({ number: isSixth ? 6 : 9, alter: value }, observations);
        setFixturePath(root, path, isSixth ? degree : [degree]);
        return root;
      }, { expectedOk: true, label: "degree-alter" }));
      index += 1;
    }
  }
  for (const collectionValue of requireFixtureArray(
    ownFixtureValue(expansion, "collectionCells"),
    "collectionCells",
  )) {
    const collection = requireFixtureRecord(collectionValue, "collection cell");
    const path = fixturePath(ownFixtureValue(collection, "target"), "collection.target");
    const sourceName = ownFixtureValue(collection, "source");
    const source = typeof sourceName === "string"
      ? ownFixtureValue(matrix, sourceName)
      : ownFixtureValue(collection, "literal");
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      setFixturePath(root, path, materializeFixtureValue(source, observations));
      return root;
    }, { expectedOk: true, label: "collection" }));
    index += 1;
  }
  return result;
}

function expandSchemaFields(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
  mode: "missing" | "wrong-type" | "unknown",
): readonly MaterializedFixtureCell[] {
  const caseId = requireFixtureString(ownFixtureValue(caseRecord, "id"), "case.id");
  const schemaTargets = requireFixtureArray(
    ownFixtureValue(sources.shape, "schemaVariantTargets"),
    "schemaVariantTargets",
  );
  const targetsById = new Map<string, readonly FixtureRecord[]>();
  for (const targetValue of schemaTargets) {
    const target = requireFixtureRecord(targetValue, "schema target");
    const id = requireFixtureString(ownFixtureValue(target, "schemaId"), "schemaId");
    targetsById.set(
      id,
      requireFixtureArray(ownFixtureValue(target, "variants"), "variants")
        .map((variant) => requireFixtureRecord(variant, "variant")),
    );
  }
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  const schemas = requireFixtureArray(ownFixtureValue(sources.manifest, "objectSchemas"), "objectSchemas");
  for (const schemaValue of schemas) {
    const schema = requireFixtureRecord(schemaValue, "object schema");
    const schemaId = requireFixtureString(ownFixtureValue(schema, "id"), "schema.id");
    const variants = targetsById.get(schemaId);
    if (variants === undefined) throw new Error(`F2_SCHEMA_TARGET:${schemaId}`);
    for (const variant of variants) {
      const basePath = fixturePath(ownFixtureValue(variant, "path"), "variant.path");
      const activation = typeof ownFixtureValue(variant, "activation") === "string"
        ? requireFixtureString(ownFixtureValue(variant, "activation"), "activation")
        : undefined;
      if (mode === "unknown") {
        const path = [...basePath, "extra"];
        result.push(makeCell(sources, caseId, index, (root, observations) => {
          applyActivations(sources, root, activation === undefined ? [] : [activation], observations);
          setFixturePath(root, path, true);
          return root;
        }, {
          expectedIssues: expectedSingle("shape.unknown_field", path),
          expectedOk: false,
          label: `${schemaId}:extra`,
        }));
        index += 1;
        continue;
      }
      const fieldTypes = mode === "wrong-type"
        ? requireFixtureRecord(ownFixtureValue(variant, "fieldTypes"), "fieldTypes")
        : undefined;
      for (const fieldValue of requireFixtureArray(
        ownFixtureValue(schema, "requiredFields"),
        "requiredFields",
      )) {
        const field = requireFixtureString(fieldValue, "required field");
        const path = [...basePath, field];
        const code = field === "schema"
          ? mode === "missing" ? "document.schema_missing" : "document.schema_invalid"
          : "shape.invalid_type";
        result.push(makeCell(sources, caseId, index, (root, observations) => {
          applyActivations(sources, root, activation === undefined ? [] : [activation], observations);
          if (mode === "missing") {
            const mutation = { operation: "delete", path };
            applyFixtureMutation(root, mutation, observations, fragmentsOf(sources));
          } else {
            const wrongTypes = requireFixtureRecord(
              ownFixtureValue(caseRecord, "wrongTypeLiterals"),
              "wrongTypeLiterals",
            );
            const fieldType = requireFixtureString(
              ownFixtureValue(requireFixtureRecord(fieldTypes, "fieldTypes"), field),
              `fieldType:${field}`,
            );
            const fixtureValue = field === "schema"
              ? ownFixtureValue(caseRecord, "schemaExceptionValue")
              : ownFixtureValue(wrongTypes, fieldType);
            setFixturePath(root, path, materializeFixtureValue(fixtureValue, observations));
          }
          return root;
        }, {
          expectedIssues: expectedSingle(code, path),
          expectedOk: false,
          label: `${schemaId}:${field}`,
        }));
        index += 1;
      }
    }
  }
  return result;
}

function expandDirectInputs(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = requireFixtureString(ownFixtureValue(caseRecord, "id"), "case.id");
  const expected = requireFixtureRecord(ownFixtureValue(caseRecord, "expected"), "expected");
  const everyCell = ownFixtureValue(expected, "everyCell");
  const fallback = expectedIssuesFrom(
    isFixtureRecord(everyCell) ? everyCell : expected,
  );
  const operation = ownFixtureValue(caseRecord, "operation") === "preflightDocumentImportBytes"
    ? "preflightDocumentImportBytes"
    : "decodeDocumentShape";
  return requireFixtureArray(ownFixtureValue(caseRecord, "inputs"), "inputs")
    .map((input, index) => makeCell(sources, caseId, index, (_root, observations) =>
      materializeFixtureValue(input, observations), {
      operation,
      ...(fallback === undefined ? {} : { expectedIssues: fallback }),
      expectedOk: false,
    }));
}

function representativePart(
  sources: ShapeSources,
  path: FixturePath,
  observations: HarnessObservationCounters,
): unknown {
  const template = freshTemplate(sources, "representativeDocument", observations);
  return materializeFixtureValue(valueAtPath(template, path), observations);
}

function expandShapeChronology(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-SHAPE-002";
  const result: MaterializedFixtureCell[] = [];
  for (const [index, cellValue] of requireFixtureArray(ownFixtureValue(caseRecord, "cells"), "cells").entries()) {
    const cell = requireFixtureRecord(cellValue, "shape chronology cell");
    const id = requireFixtureString(ownFixtureValue(cell, "id"), "cell.id");
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      if (id !== "nonlexical-chart-chronology") {
        return applyBareCell(sources, caseRecord, cell, root, observations);
      }
      const collectionIds = requireFixtureRecord(
        ownFixtureValue(cell, "collectionIds"),
        "collectionIds",
      );
      const sections = requireFixtureArray(ownFixtureValue(collectionIds, "sections"), "sections")
        .map((sectionValue) => {
          const sectionSpec = requireFixtureRecord(sectionValue, "section spec");
          const section = representativePart(sources, REPRESENTATIVE_SECTION_PATH, observations);
          setFixturePath(section, ["id"], ownFixtureValue(sectionSpec, "id"));
          const measures = requireFixtureArray(ownFixtureValue(sectionSpec, "measures"), "measures")
            .map((measureValue) => {
              const measureSpec = requireFixtureRecord(measureValue, "measure spec");
              const measure = representativePart(sources, REPRESENTATIVE_MEASURE_PATH, observations);
              setFixturePath(measure, ["id"], ownFixtureValue(measureSpec, "id"));
              const events = requireFixtureArray(ownFixtureValue(measureSpec, "eventIds"), "eventIds")
                .map((eventId) => {
                  const event = representativePart(sources, REPRESENTATIVE_EVENT_PATH, observations);
                  setFixturePath(event, ["id"], eventId);
                  return event;
                });
              setFixturePath(measure, ["events"], events);
              return measure;
            });
          setFixturePath(section, ["measures"], measures);
          return section;
        });
      setFixturePath(root, ["sections"], sections);
      return root;
    }, { expectedOk: true, label: id }));
  }
  return result;
}

function expandCompletionMatrix(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-SHAPE-006";
  return requireFixtureArray(ownFixtureValue(caseRecord, "matrix"), "matrix")
    .map((entryValue, index) => {
      const entry = requireFixtureRecord(entryValue, "completion entry");
      return makeCell(sources, caseId, index, (root, observations) => {
        setFixturePath(
          root,
          [...REPRESENTATIVE_MEASURE_PATH, "completion"],
          materializeFixtureValue(ownFixtureValue(entry, "completion"), observations),
        );
        const events = ownFixtureValue(entry, "events");
        if (Array.isArray(events)) {
          setFixturePath(root, [...REPRESENTATIVE_MEASURE_PATH, "events"], []);
        }
        const duration = ownFixtureValue(entry, "eventDuration");
        if (duration !== undefined) {
          setFixturePath(
            root,
            [...REPRESENTATIVE_EVENT_PATH, "duration"],
            materializeFixtureValue(duration, observations),
          );
        }
        return root;
      }, { expectedOk: true });
    });
}

function expandTextBoundaries(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-TEXT-001";
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const fieldValue of requireFixtureArray(ownFixtureValue(caseRecord, "fields"), "fields")) {
    const field = requireFixtureRecord(fieldValue, "text field");
    const path = fixturePath(ownFixtureValue(field, "path"), "field.path");
    const limit = requireFixtureNumber(ownFixtureValue(field, "limit"), "field.limit");
    const code = requireFixtureString(ownFixtureValue(field, "code"), "field.code");
    const branch = ownFixtureValue(field, "branch");
    const branchLabel = typeof branch === "string" ? branch : "base";
    const activations = branch === "parsed-or-custom"
      ? [undefined, "customChord"]
      : branch === "customChord-plus-manualVoicing"
      ? ["customChord-plus-manualVoicing"]
      : branch === "completion-reason"
      ? ["partialCompletion", "pickupCompletion"]
      : branch === "frozenVoicing"
      ? ["frozenVoicing"]
      : [undefined];
    for (const activation of activations) {
      for (const count of [limit, limit + 1]) {
        result.push(makeCell(sources, caseId, index, (root, observations) => {
          applyActivations(
            sources,
            root,
            activation === undefined ? [] : [activation],
            observations,
          );
          setFixturePath(root, path, "\ud834\udd1e".repeat(count));
          return root;
        }, count === limit
          ? { expectedOk: true, label: `${branchLabel}:${String(count)}` }
          : {
            expectedOk: false,
            expectedIssues: expectedSingle(code, path),
            label: `${branchLabel}:${String(count)}`,
          }));
        index += 1;
      }
    }
  }
  return result;
}

function expandTextSemantics(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-TEXT-002";
  const targets = requireFixtureArray(ownFixtureValue(caseRecord, "freeTextTargets"), "freeTextTargets")
    .map((value) => requireFixtureRecord(value, "free text target"));
  const targetsById = new Map<string, FixtureRecord>();
  for (const target of targets) {
    targetsById.set(
      requireFixtureString(ownFixtureValue(target, "id"), "target.id"),
      target,
    );
  }
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const groupValue of requireFixtureArray(ownFixtureValue(caseRecord, "cellGroups"), "cellGroups")) {
    const group = requireFixtureRecord(groupValue, "text group");
    const groupId = requireFixtureString(ownFixtureValue(group, "id"), "group.id");
    const targetIdsValue = ownFixtureValue(group, "targetIds");
    const targetIds = targetIdsValue === "all freeTextTargets"
      ? targets.map((target) => requireFixtureString(ownFixtureValue(target, "id"), "target.id"))
      : requireFixtureArray(targetIdsValue, "targetIds")
        .map((value) => requireFixtureString(value, "targetId"));
    for (const targetId of targetIds) {
      const target = targetsById.get(targetId);
      if (target === undefined) throw new Error(`F2_TEXT_TARGET:${targetId}`);
      const path = fixturePath(ownFixtureValue(target, "path"), "target.path");
      for (const value of requireFixtureArray(ownFixtureValue(group, "values"), "values")) {
        let issues: readonly ExpectedIssue[] | undefined;
        if (groupId === "lone-high" || groupId === "lone-low") {
          issues = expectedSingle("string.invalid_unicode_scalar", path);
        } else if (groupId === "feff-blank") {
          issues = expectedSingle("string.blank", path);
        } else if (groupId === "limit-before-blank") {
          issues = [
            { code: "limit.title_code_points_exceeded", path },
            { code: "string.blank", path },
          ];
        } else if (groupId === "invalid-unicode-plus-limit") {
          issues = [
            { code: "limit.title_code_points_exceeded", path },
            { code: "string.invalid_unicode_scalar", path },
          ];
        } else if (groupId === "engine-feff-blank" || groupId === "engine-blank") {
          issues = expectedSingle("voicing.engine_version_invalid", path);
        }
        result.push(makeCell(sources, caseId, index, (root, observations) => {
          const activation = ownFixtureValue(target, "activation");
          applyActivations(
            sources,
            root,
            typeof activation === "string" ? [activation] : [],
            observations,
          );
          setFixturePath(root, path, materializeFixtureValue(value, observations));
          return root;
        }, {
          expectedOk: issues === undefined,
          ...(issues === undefined ? {} : { expectedIssues: issues }),
          label: `${groupId}:${targetId}`,
        }));
        index += 1;
      }
    }
  }
  for (const cellValue of requireFixtureArray(
    ownFixtureValue(caseRecord, "consumerCoDiagnosticCells"),
    "consumerCoDiagnosticCells",
  )) {
    const cell = requireFixtureRecord(cellValue, "co-diagnostic cell");
    const targetId = requireFixtureString(ownFixtureValue(cell, "targetId"), "targetId");
    const target = targetsById.get(targetId);
    if (target === undefined) throw new Error(`F2_TEXT_TARGET:${targetId}`);
    const path = fixturePath(ownFixtureValue(target, "path"), "target.path");
    const issues = requireFixtureArray(ownFixtureValue(cell, "expectedCodes"), "expectedCodes")
      .map((code) => ({ code: requireFixtureString(code, "expectedCode"), path }));
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      const activation = ownFixtureValue(target, "activation");
      applyActivations(
        sources,
        root,
        typeof activation === "string" ? [activation] : [],
        observations,
      );
      setFixturePath(
        root,
        path,
        materializeFixtureValue(ownFixtureValue(cell, "value"), observations),
      );
      return root;
    }, {
      expectedOk: false,
      expectedIssues: issues,
      label: requireFixtureString(ownFixtureValue(cell, "id"), "cell.id"),
    }));
    index += 1;
  }
  return result;
}

function buildEventsFromSpecs(
  sources: ShapeSources,
  specsValue: unknown,
  observations: HarnessObservationCounters,
): readonly unknown[] {
  return requireFixtureArray(specsValue, "event specs").map((specValue) => {
    const spec = requireFixtureRecord(specValue, "event spec");
    const event = representativePart(sources, REPRESENTATIVE_EVENT_PATH, observations);
    setFixturePath(event, ["id"], ownFixtureValue(spec, "id"));
    if (Object.hasOwn(spec, "duration")) {
      setFixturePath(
        event,
        ["duration"],
        materializeFixtureValue(ownFixtureValue(spec, "duration"), observations),
      );
    }
    const overrides = ownFixtureValue(spec, "overrides");
    if (isFixtureRecord(overrides)) {
      for (const [field, value] of Object.entries(overrides)) {
        setFixturePath(event, [field], materializeFixtureValue(value, observations));
      }
    }
    return event;
  });
}

function expandTimeCases(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-TIME-001";
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const source of ["cells", "precedenceCells"] as const) {
    const cells = expandBareList(sources, caseRecord, source, index);
    result.push(...cells);
    index += cells.length;
  }
  for (const aggregateValue of requireFixtureArray(
    ownFixtureValue(caseRecord, "aggregateCells"),
    "aggregateCells",
  )) {
    const aggregate = requireFixtureRecord(aggregateValue, "aggregate time cell");
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      setFixturePath(
        root,
        [...REPRESENTATIVE_MEASURE_PATH, "events"],
        buildEventsFromSpecs(sources, ownFixtureValue(aggregate, "events"), observations),
      );
      return root;
    }, cellOptionsFrom(aggregate, undefined)));
    index += 1;
  }
  const denominators = requireFixtureRecord(
    ownFixtureValue(caseRecord, "acceptedDenominatorCell"),
    "acceptedDenominatorCell",
  );
  for (const value of requireFixtureArray(ownFixtureValue(denominators, "values"), "values")) {
    const cell: FixtureRecord = { ...denominators, value };
    result.push(makeCell(sources, caseId, index, (root, observations) =>
      applyBareCell(sources, caseRecord, cell, root, observations), {
      expectedOk: true,
      label: `denominator:${String(value)}`,
    }));
    index += 1;
  }
  const beatCells = requireFixtureArray(
    ownFixtureValue(caseRecord, "expectedDurationBeatCells"),
    "expectedDurationBeatCells",
  );
  for (const targetValue of requireFixtureArray(
    ownFixtureValue(caseRecord, "expectedDurationConsumerTargets"),
    "expectedDurationConsumerTargets",
  )) {
    const target = requireFixtureRecord(targetValue, "expected duration target");
    const path = fixturePath(ownFixtureValue(target, "path"), "target.path");
    const activation = requireFixtureString(ownFixtureValue(target, "activation"), "activation");
    for (const beatValue of beatCells) {
      const beat = requireFixtureRecord(beatValue, "expected duration beat");
      const expected = requireFixtureRecord(ownFixtureValue(beat, "expected"), "expected");
      const code = ownFixtureValue(expected, "code");
      const pathRule = ownFixtureValue(expected, "pathRule");
      const issuePath = typeof pathRule === "string" && pathRule.endsWith("numerator")
        ? [...path, "numerator"]
        : typeof pathRule === "string" && pathRule.endsWith("denominator")
        ? [...path, "denominator"]
        : path;
      const issues = typeof code === "string" ? expectedSingle(code, issuePath) : undefined;
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        applyActivations(sources, root, [activation], observations);
        setFixturePath(
          root,
          path,
          materializeFixtureValue(ownFixtureValue(beat, "value"), observations),
        );
        return root;
      }, {
        expectedOk: issues === undefined,
        ...(issues === undefined ? {} : { expectedIssues: issues }),
        label: `${String(ownFixtureValue(target, "id"))}:${String(ownFixtureValue(beat, "id"))}`,
      }));
      index += 1;
    }
  }
  return result;
}

function expandValueOne(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-VALUE-001";
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const source of ["acceptedCells", "rejectedCells"] as const) {
    for (const entryValue of requireFixtureArray(ownFixtureValue(caseRecord, source), source)) {
      const entry = requireFixtureRecord(entryValue, source);
      for (const value of requireFixtureArray(ownFixtureValue(entry, "values"), "values")) {
        const cell: FixtureRecord = { ...entry, value };
        result.push(makeCell(sources, caseId, index, (root, observations) =>
          applyBareCell(sources, caseRecord, cell, root, observations),
        source === "acceptedCells"
          ? { expectedOk: true }
          : cellOptionsFrom(cell, undefined)));
        index += 1;
      }
    }
  }
  for (const [targetsKey, groupsKey] of [
    ["midiConsumerTargets", "midiFaultGroups"],
    ["playbackLevelTargets", "playbackLevelFaultGroups"],
  ] as const) {
    for (const targetValue of requireFixtureArray(ownFixtureValue(caseRecord, targetsKey), targetsKey)) {
      const path = fixturePath(targetValue, targetsKey);
      for (const groupValue of requireFixtureArray(ownFixtureValue(caseRecord, groupsKey), groupsKey)) {
        const group = requireFixtureRecord(groupValue, groupsKey);
        const code = requireFixtureString(ownFixtureValue(group, "code"), "group.code");
        for (const value of requireFixtureArray(ownFixtureValue(group, "values"), "values")) {
          result.push(makeCell(sources, caseId, index, (root, observations) => {
            setFixturePath(root, path, materializeFixtureValue(value, observations));
            return root;
          }, { expectedOk: false, expectedIssues: expectedSingle(code, path) }));
          index += 1;
        }
      }
    }
  }
  return result;
}

function targetActivation(target: FixtureRecord): string | undefined {
  const activation = ownFixtureValue(target, "activation");
  return typeof activation === "string" ? activation : undefined;
}

function expandTargetFaultProduct(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
  caseId: string,
  targetsKey: string,
  faultsKey: string,
  startIndex: number,
  pathSuffix: (fault: FixtureRecord) => FixturePath,
): readonly MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  let index = startIndex;
  for (const targetValue of requireFixtureArray(ownFixtureValue(caseRecord, targetsKey), targetsKey)) {
    const target = requireFixtureRecord(targetValue, targetsKey);
    const targetPath = fixturePath(ownFixtureValue(target, "path"), "target.path");
    for (const faultValue of requireFixtureArray(ownFixtureValue(caseRecord, faultsKey), faultsKey)) {
      const fault = requireFixtureRecord(faultValue, faultsKey);
      const suffix = pathSuffix(fault);
      const path = [...targetPath, ...suffix];
      const code = requireFixtureString(ownFixtureValue(fault, "code"), "fault.code");
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        const activation = targetActivation(target);
        applyActivations(sources, root, activation === undefined ? [] : [activation], observations);
        setFixturePath(
          root,
          path,
          materializeFixtureValue(ownFixtureValue(fault, "value"), observations),
        );
        return root;
      }, { expectedOk: false, expectedIssues: expectedSingle(code, path) }));
      index += 1;
    }
  }
  return result;
}

function expandValueTwo(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-VALUE-002";
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const source of ["acceptedCells", "rejectedCells"] as const) {
    for (const entryValue of requireFixtureArray(ownFixtureValue(caseRecord, source), source)) {
      const entry = requireFixtureRecord(entryValue, source);
      const values = ownFixtureValue(entry, "values");
      const expandedValues = Array.isArray(values) ? values : [undefined];
      for (const value of expandedValues) {
        const cell: FixtureRecord = value === undefined ? entry : { ...entry, value };
        result.push(makeCell(sources, caseId, index, (root, observations) =>
          applyBareCell(sources, caseRecord, cell, root, observations),
        source === "acceptedCells"
          ? { expectedOk: true }
          : cellOptionsFrom(cell, undefined)));
        index += 1;
      }
    }
  }
  const invalidPitch = expandTargetFaultProduct(
    sources,
    caseRecord,
    caseId,
    "invalidPitchClassConsumerTargets",
    "invalidPitchClassFaults",
    index,
    (fault) => [requireFixtureString(ownFixtureValue(fault, "field"), "fault.field")],
  );
  result.push(...invalidPitch);
  index += invalidPitch.length;
  for (const targetValue of requireFixtureArray(ownFixtureValue(caseRecord, "idConsumerTargets"), "idConsumerTargets")) {
    const target = requireFixtureRecord(targetValue, "id target");
    const path = fixturePath(ownFixtureValue(target, "path"), "target.path");
    for (const boundaryValue of requireFixtureArray(ownFixtureValue(caseRecord, "idBoundaryCells"), "idBoundaryCells")) {
      const boundary = requireFixtureRecord(boundaryValue, "id boundary");
      const fixtureValue = Object.hasOwn(boundary, "descriptor")
        ? ownFixtureValue(boundary, "descriptor")
        : ownFixtureValue(boundary, "value");
      const expected = requireFixtureRecord(ownFixtureValue(boundary, "expected"), "expected");
      const code = ownFixtureValue(expected, "code");
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        setFixturePath(root, path, materializeFixtureValue(fixtureValue, observations));
        return root;
      }, typeof code === "string"
        ? { expectedOk: false, expectedIssues: expectedSingle(code, path) }
        : { expectedOk: true }));
      index += 1;
    }
  }
  const pitchTargetGroups = [
    "invalidPitchClassConsumerTargets",
    "storedPitchConsumerTargets",
  ] as const;
  for (const targetsKey of pitchTargetGroups) {
    for (const targetValue of requireFixtureArray(ownFixtureValue(caseRecord, targetsKey), targetsKey)) {
      const target = requireFixtureRecord(targetValue, targetsKey);
      const basePath = fixturePath(ownFixtureValue(target, "path"), "target.path");
      for (const axisValue of requireFixtureArray(ownFixtureValue(caseRecord, "acceptedPitchAxes"), "acceptedPitchAxes")) {
        const axis = requireFixtureRecord(axisValue, "pitch axis");
        const field = requireFixtureString(ownFixtureValue(axis, "field"), "axis.field");
        for (const value of requireFixtureArray(ownFixtureValue(axis, "values"), "axis.values")) {
          result.push(makeCell(sources, caseId, index, (root, observations) => {
            const activation = targetActivation(target);
            applyActivations(sources, root, activation === undefined ? [] : [activation], observations);
            setFixturePath(root, [...basePath, field], materializeFixtureValue(value, observations));
            if (ownFixtureValue(target, "id") === "custom-bass") {
              const bassStep = valueAtPath(root, [...basePath, "step"]);
              const bassAlter = valueAtPath(root, [...basePath, "alter"]);
              setFixturePath(
                root,
                [...REPRESENTATIVE_EVENT_PATH, "voicing", "pitches", 0],
                { step: bassStep, alter: bassAlter, octave: 3 },
              );
            }
            return root;
          }, { expectedOk: true }));
          index += 1;
        }
      }
    }
  }
  const storedTargets = requireFixtureArray(
    ownFixtureValue(caseRecord, "storedPitchConsumerTargets"),
    "storedPitchConsumerTargets",
  );
  for (const targetValue of storedTargets) {
    const target = requireFixtureRecord(targetValue, "stored target");
    const basePath = fixturePath(ownFixtureValue(target, "path"), "target.path");
    for (const value of requireFixtureArray(
      ownFixtureValue(caseRecord, "storedPitchOctaveBoundaryValues"),
      "storedPitchOctaveBoundaryValues",
    )) {
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        const activation = targetActivation(target);
        applyActivations(sources, root, activation === undefined ? [] : [activation], observations);
        setFixturePath(root, [...basePath, "octave"], materializeFixtureValue(value, observations));
        return root;
      }, { expectedOk: true }));
      index += 1;
    }
  }
  const octaveFaults = expandTargetFaultProduct(
    sources,
    caseRecord,
    caseId,
    "storedPitchConsumerTargets",
    "storedPitchOctaveFaults",
    index,
    () => ["octave"],
  );
  result.push(...octaveFaults);
  index += octaveFaults.length;
  const storedPitchFaults = expandTargetFaultProduct(
    sources,
    caseRecord,
    caseId,
    "storedPitchConsumerTargets",
    "invalidPitchClassFaults",
    index,
    (fault) => [requireFixtureString(ownFixtureValue(fault, "field"), "fault.field")],
  );
  result.push(...storedPitchFaults);
  index += storedPitchFaults.length;
  const invalidDegreeCells = expandBareList(
    sources,
    caseRecord,
    "invalidDegreeAlterConsumerCells",
    index,
  );
  result.push(...invalidDegreeCells);
  index += invalidDegreeCells.length;
  const additionalDegree = requireFixtureRecord(
    ownFixtureValue(caseRecord, "additionalDegreeNumberRefusalCell"),
    "additionalDegreeNumberRefusalCell",
  );
  result.push(makeCell(sources, caseId, index, (root, observations) =>
    applyBareCell(sources, caseRecord, additionalDegree, root, observations),
  cellOptionsFrom(additionalDegree, undefined)));
  index += 1;
  for (const targetsKey of pitchTargetGroups) {
    for (const targetValue of requireFixtureArray(ownFixtureValue(caseRecord, targetsKey), targetsKey)) {
      const target = requireFixtureRecord(targetValue, targetsKey);
      const path = [
        ...fixturePath(ownFixtureValue(target, "path"), "target.path"),
        "alter",
      ];
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        const activation = targetActivation(target);
        applyActivations(sources, root, activation === undefined ? [] : [activation], observations);
        setFixturePath(root, path, -0);
        return root;
      }, { expectedOk: true }));
      index += 1;
    }
  }
  for (const source of [
    "degreeNegativeZeroPreservationCells",
    "additionalNegativeZeroPreservationCells",
  ] as const) {
    const cells = expandBareList(sources, caseRecord, source, index);
    result.push(...cells);
    index += cells.length;
  }
  return result;
}

function expectedFromVoiceOracle(value: unknown): Readonly<{
  ok: boolean;
  issues?: readonly ExpectedIssue[];
}> {
  if (value === "ok") return { ok: true };
  const expected = requireFixtureRecord(value, "voice expected");
  if (ownFixtureValue(expected, "ok") === true) return { ok: true };
  const issue = expectedIssuesFrom(expected);
  if (issue !== undefined) return { ok: false, issues: issue };
  const code = ownFixtureValue(expected, "code");
  const path = ownFixtureValue(expected, "path");
  if (typeof code === "string" && Array.isArray(path)) {
    return { ok: false, issues: expectedSingle(code, fixturePath(path, "voice path")) };
  }
  throw new Error("F2_VOICE_EXPECTED");
}

function voiceOptions(
  expected: Readonly<{ ok: boolean; issues?: readonly ExpectedIssue[] }>,
  label: string,
): CellOptions {
  return {
    expectedOk: expected.ok,
    ...(expected.issues === undefined ? {} : { expectedIssues: expected.issues }),
    label,
  };
}

function expandVoiceCases(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-VOICE-001";
  const matrix = requireFixtureRecord(ownFixtureValue(caseRecord, "matrix"), "voice matrix");
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  const autoOracle = requireFixtureArray(ownFixtureValue(caseRecord, "autoPolicyOracle"), "autoPolicyOracle")
    .map((value) => requireFixtureRecord(value, "auto oracle"));
  for (const familyValue of requireFixtureArray(ownFixtureValue(matrix, "families"), "families")) {
    const family = requireFixtureString(familyValue, "family");
    for (const slashValue of requireFixtureArray(ownFixtureValue(matrix, "slashBass"), "slashBass")) {
      const slash = requireFixtureBoolean(slashValue, "slashBass");
      for (const policyValue of requireFixtureArray(ownFixtureValue(matrix, "autoBassPolicies"), "autoBassPolicies")) {
        const policy = requireFixtureString(policyValue, "policy");
        const oracle = autoOracle.find((entry) =>
          requireFixtureArray(ownFixtureValue(entry, "families"), "oracle.families").includes(family) &&
          ownFixtureValue(entry, "slashBass") === slash);
        if (oracle === undefined) throw new Error("F2_AUTO_ORACLE");
        const policies = requireFixtureRecord(ownFixtureValue(oracle, "policies"), "policies");
        const expected = expectedFromVoiceOracle(ownFixtureValue(policies, policy));
        result.push(makeCell(sources, caseId, index, (root, observations) => {
          setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "chord", "bass"],
            slash ? { step: "C", alter: 0 } : null);
          setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "voicing", "family"], family);
          setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "voicing", "bassPolicy"], policy);
          void observations;
          return root;
        }, voiceOptions(expected, `auto:${family}:${slash ? "slash" : "plain"}:${policy}`)));
        index += 1;
      }
    }
  }
  const modes = requireFixtureArray(ownFixtureValue(matrix, "storedModes"), "storedModes")
    .map((value) => requireFixtureString(value, "stored mode"));
  const storedSources = ["storedPolicyCells", "spellingAndTranspositionCells"] as const;
  for (const source of storedSources) {
    for (const storedValue of requireFixtureArray(ownFixtureValue(caseRecord, source), source)) {
      const stored = requireFixtureRecord(storedValue, source);
      for (const mode of modes) {
        const expected = expectedFromVoiceOracle(ownFixtureValue(stored, "expected"));
        result.push(makeCell(sources, caseId, index, (root, observations) => {
          applyActivations(sources, root, [mode === "manual" ? "manualVoicing" : "frozenVoicing"], observations);
          setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "chord", "bass"],
            materializeFixtureValue(ownFixtureValue(stored, "slashBass"), observations));
          setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "voicing", "bassPolicy"],
            ownFixtureValue(stored, "bassPolicy"));
          const pitchCount = ownFixtureValue(stored, "pitchCount");
          const pitches = typeof pitchCount === "number"
            ? Array.from({ length: pitchCount }, () => ({ step: "C", alter: 0, octave: 4 }))
            : materializeFixtureValue(ownFixtureValue(stored, "pitches"), observations);
          setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "voicing", "pitches"], pitches);
          return root;
        }, voiceOptions(expected, `${source}:${mode}`)));
        index += 1;
      }
    }
  }
  for (const mode of modes) {
    for (const countValue of requireFixtureArray(ownFixtureValue(matrix, "storedPitchCounts"), "storedPitchCounts")) {
      const count = requireFixtureNumber(countValue, "stored pitch count");
      const path = [...REPRESENTATIVE_EVENT_PATH, "voicing", "pitches"];
      const expected = count === 0
        ? expectedSingle("voicing.pitches_empty", path)
        : count === 17
        ? expectedSingle("limit.voicing_notes_exceeded", path)
        : undefined;
      result.push(makeCell(sources, caseId, index, (root, observations) => {
        applyActivations(sources, root, [mode === "manual" ? "manualVoicing" : "frozenVoicing"], observations);
        setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "chord", "bass"], null);
        setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "voicing", "bassPolicy"], "included");
        setFixturePath(root, path,
          Array.from({ length: count }, () => ({ step: "C", alter: 0, octave: 4 })));
        return root;
      }, {
        expectedOk: expected === undefined,
        ...(expected === undefined ? {} : { expectedIssues: expected }),
        label: `count:${mode}:${String(count)}`,
      }));
      index += 1;
    }
  }
  for (const family of requireFixtureArray(ownFixtureValue(matrix, "families"), "families")) {
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      applyActivations(sources, root, ["frozenVoicing"], observations);
      setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "voicing", "generatedBy", "family"], family);
      return root;
    }, { expectedOk: true, label: `frozen-family:${String(family)}` }));
    index += 1;
  }
  for (const customValue of requireFixtureArray(ownFixtureValue(caseRecord, "customStoredCells"), "customStoredCells")) {
    const custom = requireFixtureRecord(customValue, "custom stored cell");
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      applyActivations(sources, root, [
        requireFixtureString(ownFixtureValue(custom, "chordActivation"), "chordActivation"),
        requireFixtureString(ownFixtureValue(custom, "voicingActivation"), "voicingActivation"),
      ], observations);
      setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "chord", "bass"],
        materializeFixtureValue(ownFixtureValue(custom, "chordBass"), observations));
      const overrides = ownFixtureValue(custom, "voicingOverrides");
      if (isFixtureRecord(overrides)) {
        for (const [field, value] of Object.entries(overrides)) {
          setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "voicing", field],
            materializeFixtureValue(value, observations));
        }
      }
      return root;
    }, { expectedOk: true, label: requireFixtureString(ownFixtureValue(custom, "id"), "custom.id") }));
    index += 1;
  }
  const pitchOrder = requireFixtureRecord(ownFixtureValue(caseRecord, "customPitchOrderCell"), "customPitchOrderCell");
  result.push(makeCell(sources, caseId, index, (root, observations) => {
    applyActivations(sources, root, [
      requireFixtureString(ownFixtureValue(pitchOrder, "activation"), "activation"),
    ], observations);
    setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "chord", "pitchNames"],
      materializeFixtureValue(ownFixtureValue(pitchOrder, "pitchNames"), observations));
    return root;
  }, { expectedOk: true, label: "custom-pitch-order" }));
  index += 1;
  const crossEvent = requireFixtureRecord(
    ownFixtureValue(caseRecord, "crossEventAggregationCell"),
    "crossEventAggregationCell",
  );
  result.push(makeCell(sources, caseId, index, (root, observations) => {
    const events = requireFixtureArray(ownFixtureValue(crossEvent, "events"), "events")
      .map((eventValue) => {
        const spec = requireFixtureRecord(eventValue, "cross event");
        const event = representativePart(sources, REPRESENTATIVE_EVENT_PATH, observations);
        setFixturePath(event, ["id"], ownFixtureValue(spec, "id"));
        if (ownFixtureValue(spec, "chordFragment") === "customChord") {
          setFixturePath(event, ["chord"],
            materializeFixtureValue(ownFixtureValue(fragmentsOf(sources), "customChord"), observations));
        }
        setFixturePath(event, ["voicing"],
          materializeFixtureValue(ownFixtureValue(spec, "voicing"), observations));
        return event;
      });
    setFixturePath(root, [...REPRESENTATIVE_MEASURE_PATH, "events"], events);
    return root;
  }, cellOptionsFrom(crossEvent, undefined, { label: "cross-event" })));
  return result;
}

function expandInvalidSchema(
  sources: ShapeSources,
  caseRecord: FixtureRecord,
): readonly MaterializedFixtureCell[] {
  const caseId = "F2-SHAPE-010";
  const target = fixturePath(ownFixtureValue(caseRecord, "target"), "target");
  const result: MaterializedFixtureCell[] = [];
  let index = 0;
  for (const value of requireFixtureArray(ownFixtureValue(caseRecord, "values"), "values")) {
    result.push(makeCell(sources, caseId, index, (root, observations) => {
      setFixturePath(root, target, materializeFixtureValue(value, observations));
      return root;
    }, {
      expectedOk: false,
      expectedIssues: expectedSingle("document.schema_invalid", target),
    }));
    index += 1;
  }
  const aggregate = requireFixtureRecord(ownFixtureValue(caseRecord, "aggregateCell"), "aggregateCell");
  result.push(makeCell(sources, caseId, index, (root, observations) =>
    applyBareCell(sources, caseRecord, aggregate, root, observations),
  cellOptionsFrom(aggregate, undefined, { label: "aggregate" })));
  return result;
}

function expandSimpleShapeCases(
  sources: ShapeSources,
  cases: ReadonlyMap<string, FixtureRecord>,
): MaterializedFixtureCell[] {
  const result: MaterializedFixtureCell[] = [];
  result.push(...expandChordAccepted(sources, requireCase(cases, "F2-CHORD-001")));
  for (const id of ["F2-CHORD-002", "F2-CHORD-003"] as const) {
    const record = requireCase(cases, id);
    let index = 0;
    for (const source of ["cells", "additionalConsumerCells"] as const) {
      const expanded = expandBareList(sources, record, source, index);
      result.push(...expanded);
      index += expanded.length;
    }
    if (id === "F2-CHORD-003") {
      const aggregate = requireFixtureRecord(ownFixtureValue(record, "aggregateCell"), "aggregateCell");
      result.push(makeCell(sources, id, index, (root, observations) =>
        applyBareCell(sources, record, aggregate, root, observations),
      cellOptionsFrom(aggregate, undefined, { label: "aggregate" })));
    }
  }
  for (const id of ["F2-CHORD-004", "F2-FIELD-004", "F2-FIELD-005", "F2-ID-005", "F2-ID-006", "F2-SHAPE-009"] as const) {
    const record = requireCase(cases, id);
    const fallback = id === "F2-CHORD-004"
      ? requireFixtureRecord(ownFixtureValue(
        requireFixtureRecord(ownFixtureValue(record, "expected"), "expected"),
        "everyCell",
      ), "everyCell")
      : undefined;
    const cells = expandBareList(sources, record, "cells", 0, fallback);
    if (id === "F2-FIELD-004") {
      result.push(...cells.map((cell, index) => {
        if (cell.expectedIssues !== undefined) return cell;
        const raw = requireFixtureRecord(
          requireFixtureArray(ownFixtureValue(record, "cells"), "cells")[index],
          "field cell",
        );
        const path = pathForCell(record, raw);
        if (path === undefined) throw new Error("F2_FIELD_004_PATH");
        return { ...cell, expectedOk: false, expectedIssues: expectedSingle("shape.invalid_type", path) };
      }));
    } else if (id === "F2-FIELD-005") {
      result.push(...cells.map((cell, index) => {
        const raw = requireFixtureRecord(
          requireFixtureArray(ownFixtureValue(record, "cells"), "cells")[index],
          "field cell",
        );
        const path = pathForCell(record, raw);
        if (path === undefined) throw new Error("F2_FIELD_005_PATH");
        return {
          ...cell,
          expectedOk: false,
          expectedIssues: expectedSingle(
            requireFixtureString(ownFixtureValue(raw, "code"), "cell.code"),
            path,
          ),
        };
      }));
    } else if (id === "F2-ID-006") {
      const counterOracleByCell = requireFixtureRecord(
        ownFixtureValue(
          requireFixtureRecord(ownFixtureValue(record, "expected"), "expected"),
          "counterOracleByCell",
        ),
        "counterOracleByCell",
      );
      result.push(...cells.map((cell, index) => {
        const raw = requireFixtureRecord(
          requireFixtureArray(ownFixtureValue(record, "cells"), "cells")[index],
          "ID cell",
        );
        const cellId = requireFixtureString(ownFixtureValue(raw, "id"), "cell.id");
        return {
          ...cell,
          expectedEvidence: requireFixtureRecord(
            ownFixtureValue(counterOracleByCell, cellId),
            `counterOracleByCell.${cellId}`,
          ),
        };
      }));
    } else {
      result.push(...cells);
    }
  }
  for (const id of [
    "F2-CHORD-005",
    "F2-CHORD-006",
    "F2-ID-002",
    "F2-ID-004",
    "F2-SHAPE-001",
    "F2-SHAPE-003",
    "F2-SHAPE-004",
    "F2-SHAPE-007",
  ] as const) {
    result.push(...singularCase(sources, requireCase(cases, id)));
  }
  return result;
}

function requireCase(
  cases: ReadonlyMap<string, FixtureRecord>,
  id: string,
): FixtureRecord {
  const result = cases.get(id);
  if (result === undefined) throw new Error(`F2_CASE_MISSING:${id}`);
  return result;
}

export function materializeF2ShapeCases(
  manifestValue: unknown,
  shapeValue: unknown,
): readonly MaterializedFixtureCell[] {
  const sources = parseSources(manifestValue, shapeValue);
  const cases = caseById(sources);
  const result = expandSimpleShapeCases(sources, cases);

  result.push(...expandSchemaFields(sources, requireCase(cases, "F2-FIELD-001"), "missing"));
  const wrongType = requireCase(cases, "F2-FIELD-002");
  result.push(...expandSchemaFields(sources, wrongType, "wrong-type"));
  let field2Index = 106;
  const callable = requireFixtureRecord(ownFixtureValue(wrongType, "callableRecordNearMiss"), "callable");
  result.push(makeCell(sources, "F2-FIELD-002", field2Index, (root, observations) =>
    applyBareCell(sources, wrongType, callable, root, observations),
  cellOptionsFrom(callable, undefined, { label: "callable-record" })));
  field2Index += 1;
  for (const nearMissValue of requireFixtureArray(
    ownFixtureValue(wrongType, "hostilePrimitiveNearMisses"),
    "hostilePrimitiveNearMisses",
  )) {
    const nearMiss = requireFixtureRecord(nearMissValue, "hostile primitive");
    for (const value of requireFixtureArray(ownFixtureValue(nearMiss, "values"), "values")) {
      const expanded: FixtureRecord = { ...nearMiss, value };
      result.push(makeCell(sources, "F2-FIELD-002", field2Index, (root, observations) =>
        applyBareCell(sources, wrongType, expanded, root, observations),
      cellOptionsFrom(expanded, undefined)));
      field2Index += 1;
    }
  }
  const unknownFields = requireCase(cases, "F2-FIELD-003");
  result.push(...expandSchemaFields(sources, unknownFields, "unknown"));
  result.push(...expandBareList(sources, unknownFields, "variantInappropriateCells", 34)
    .map((cell, offset) => {
      const raw = requireFixtureRecord(
        requireFixtureArray(
          ownFixtureValue(unknownFields, "variantInappropriateCells"),
          "variantInappropriateCells",
        )[offset],
        "variant inappropriate cell",
      );
      const path = pathForCell(unknownFields, raw);
      if (path === undefined) throw new Error("F2_FIELD_003_PATH");
      return {
        ...cell,
        expectedOk: false,
        expectedIssues: expectedSingle("shape.unknown_field", path),
      };
    }));

  result.push(...singularCase(sources, requireCase(cases, "F2-ID-001"), (root, observations) => {
    const event0 = valueAtPath(root, REPRESENTATIVE_EVENT_PATH);
    const event1 = materializeFixtureValue(event0, observations);
    setFixturePath(event0, ["id"], "event-duplicate");
    setFixturePath(event1, ["id"], "event-duplicate");
    setFixturePath(root, [...REPRESENTATIVE_MEASURE_PATH, "events"], [event0, event1]);
    return root;
  }));

  const id3 = requireCase(cases, "F2-ID-003");
  result.push(makeCell(sources, "F2-ID-003", 0, (root) => {
    setFixturePath(root, ["id"], "cluster-3");
    setFixturePath(root, ["sections", 0, "id"], "cluster-3");
    setFixturePath(root, [...REPRESENTATIVE_EVENT_PATH, "id"], "cluster-3");
    return root;
  }, cellOptionsFrom(id3, undefined, { label: "primary" })));
  const id3Counterpart = requireFixtureRecord(
    ownFixtureValue(id3, "invalidSiblingCounterpart"),
    "invalidSiblingCounterpart",
  );
  result.push(makeCell(sources, "F2-ID-003", 1, (root, observations) =>
    applyBareCell(sources, id3, id3Counterpart, root, observations),
  cellOptionsFrom(id3Counterpart, undefined, { label: "invalid-sibling" })));

  result.push(...expandShapeChronology(sources, requireCase(cases, "F2-SHAPE-002")));
  const shape5 = requireCase(cases, "F2-SHAPE-005");
  result.push(...singularCase(sources, shape5));
  const frozenCounterpart = requireFixtureRecord(
    ownFixtureValue(shape5, "frozenCounterpart"),
    "frozenCounterpart",
  );
  result.push(makeCell(sources, "F2-SHAPE-005", 1, (root, observations) =>
    applyBareCell(sources, shape5, frozenCounterpart, root, observations),
  cellOptionsFrom(frozenCounterpart, undefined, { label: "frozen" })));
  result.push(...expandCompletionMatrix(sources, requireCase(cases, "F2-SHAPE-006")));
  result.push(...expandDirectInputs(sources, requireCase(cases, "F2-SHAPE-008")));
  result.push(...expandInvalidSchema(sources, requireCase(cases, "F2-SHAPE-010")));

  result.push(...expandTextBoundaries(sources, requireCase(cases, "F2-TEXT-001")));
  result.push(...expandTextSemantics(sources, requireCase(cases, "F2-TEXT-002")));
  result.push(...expandTimeCases(sources, requireCase(cases, "F2-TIME-001")));
  result.push(...expandValueOne(sources, requireCase(cases, "F2-VALUE-001")));
  result.push(...expandValueTwo(sources, requireCase(cases, "F2-VALUE-002")));
  result.push(...expandVoiceCases(sources, requireCase(cases, "F2-VOICE-001")));

  return result;
}
