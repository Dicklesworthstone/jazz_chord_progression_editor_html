import {
  evaluateV0ConformanceProjection,
  executeV0ConformanceCase,
  type V0CanonicalJson,
  type V0ConformanceCaseEnvelope,
} from "./v0-conformance-harness";

export type V0JsonPathPart = string | number;
export type V0JsonPath = readonly V0JsonPathPart[];

type ExactReplaceAction = Readonly<{
  kind: "replace-exact";
  path: V0JsonPath;
  expected: V0CanonicalJson;
  replacement: V0CanonicalJson;
}>;

type RemoveMatchingAction = Readonly<{
  kind: "remove-matching-array-entry";
  arrayPath: V0JsonPath;
  predicatePath: V0JsonPath;
  expectedPredicateValue: V0CanonicalJson;
  expectedMatchCount: 1;
}>;

type InsertExactAction = Readonly<{
  kind: "insert-exact-array-entry";
  arrayPath: V0JsonPath;
  expectedLength: number;
  index: number;
  value: V0CanonicalJson;
}>;

type ReverseExactAction = Readonly<{
  kind: "reverse-exact-array";
  path: V0JsonPath;
  expected: readonly V0CanonicalJson[];
}>;

type ReplaceEntireProjectionAction = Readonly<{
  kind: "replace-entire-projection";
  expected: V0CanonicalJson;
  replacement: V0CanonicalJson;
}>;

export type V0ExactMutationAction =
  | ExactReplaceAction
  | RemoveMatchingAction
  | InsertExactAction
  | ReverseExactAction
  | ReplaceEntireProjectionAction;

export type V0ExactCaseMutation = Readonly<{
  semanticFault: string;
  selectorContract: string;
  actions: readonly V0ExactMutationAction[];
}>;

export type V0SemanticMutationSpec = Readonly<{
  controlId: string;
  algorithm: string;
  reviewedInvariant: string;
  cases: Readonly<Record<string, V0ExactCaseMutation>>;
}>;

export type V0MaterializedCaseObservation = Readonly<{
  envelope: V0ConformanceCaseEnvelope;
  fixtureRecordSha256: string;
  beforeProjection: V0CanonicalJson;
  expectedProjection: V0CanonicalJson;
  baselineAccepted: true;
}>;

export type V0AppliedSemanticCounterfactual = Readonly<{
  beforeProjection: V0CanonicalJson;
  afterProjection: V0CanonicalJson;
  expectedProjection: V0CanonicalJson;
  baselineDetectorProjection: V0CanonicalJson;
  mutantDetectorProjection: V0CanonicalJson;
  targetPath: string;
  affectedPaths: readonly string[];
  affectedCount: number;
  baselineAccepted: true;
  mutantAccepted: false;
  caseBindingPreserved: true;
  outOfScopeMismatchPaths: readonly [];
  mutationOperation: Readonly<{
    algorithm: string;
    semanticFault: string;
    selectorContract: string;
    actions: readonly V0ExactMutationAction[];
  }>;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function stable(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function clone(value: V0CanonicalJson): V0CanonicalJson {
  return JSON.parse(JSON.stringify(value)) as V0CanonicalJson;
}

function jsonPath(parts: readonly V0JsonPathPart[]): string {
  return parts.reduce<string>((path, part) =>
    typeof part === "number"
      ? `${path}[${String(part)}]`
      : /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(part)
        ? `${path}.${part}`
        : `${path}[${JSON.stringify(part)}]`, "$"
  );
}

function readPath(root: unknown, parts: V0JsonPath, label: string): unknown {
  let current = root;
  for (const part of parts) {
    if (Array.isArray(current) && typeof part === "number") {
      if (part < 0 || part >= current.length) {
        throw new Error(`${label}: missing ${jsonPath(parts)}`);
      }
      current = current[part];
      continue;
    }
    if (
      current !== null && typeof current === "object" &&
      typeof part === "string" && Object.hasOwn(current, part)
    ) {
      current = (current as Readonly<Record<string, unknown>>)[part];
      continue;
    }
    throw new Error(`${label}: missing ${jsonPath(parts)}`);
  }
  return current;
}

function mutableParent(
  root: V0CanonicalJson,
  path: V0JsonPath,
  label: string,
): Readonly<{
  parent: Record<string | number, unknown> | unknown[];
  key: V0JsonPathPart;
}> {
  if (path.length === 0) throw new Error(`${label}: root replacement forbidden`);
  const parentPath = path.slice(0, -1);
  const parent = readPath(root, parentPath, label);
  const key = path.at(-1);
  if (
    key === undefined || parent === null || typeof parent !== "object" ||
    (Array.isArray(parent) ? typeof key !== "number" : typeof key !== "string")
  ) throw new Error(`${label}: invalid mutable path ${jsonPath(path)}`);
  return {
    parent: parent as Record<string | number, unknown> | unknown[],
    key,
  };
}

function applyAction(
  root: V0CanonicalJson,
  action: V0ExactMutationAction,
  label: string,
): V0CanonicalJson {
  if (action.kind === "replace-entire-projection") {
    if (stable(root) !== stable(action.expected)) {
      throw new Error(`${label}: exact baseline projection drifted`);
    }
    return clone(action.replacement);
  }
  if (action.kind === "replace-exact") {
    const actual = readPath(root, action.path, label);
    if (stable(actual) !== stable(action.expected)) {
      throw new Error(
        `${label}: ${jsonPath(action.path)} expected ${stable(action.expected)} ` +
          `but observed ${stable(actual)}`,
      );
    }
    const { parent, key } = mutableParent(root, action.path, label);
    (parent as Record<string | number, unknown>)[key] = clone(action.replacement);
    return root;
  }
  if (action.kind === "remove-matching-array-entry") {
    const candidate = readPath(root, action.arrayPath, label);
    if (!Array.isArray(candidate)) {
      throw new Error(`${label}: ${jsonPath(action.arrayPath)} is not an array`);
    }
    const indexes = candidate.flatMap((entry, index) =>
      stable(readPath(entry, action.predicatePath, label)) ===
          stable(action.expectedPredicateValue)
        ? [index]
        : []
    );
    if (indexes.length !== action.expectedMatchCount) {
      throw new Error(
        `${label}: ${jsonPath(action.arrayPath)} expected one exact ` +
          `${jsonPath(action.predicatePath)} match`,
      );
    }
    candidate.splice(indexes[0] as number, 1);
    return root;
  }
  if (action.kind === "insert-exact-array-entry") {
    const candidate = readPath(root, action.arrayPath, label);
    if (!Array.isArray(candidate) || candidate.length !== action.expectedLength) {
      throw new Error(
        `${label}: ${jsonPath(action.arrayPath)} expected length ` +
          String(action.expectedLength),
      );
    }
    if (action.index < 0 || action.index > candidate.length) {
      throw new Error(`${label}: invalid insertion index ${String(action.index)}`);
    }
    candidate.splice(action.index, 0, clone(action.value));
    return root;
  }
  const candidate = readPath(root, action.path, label);
  if (!Array.isArray(candidate) || stable(candidate) !== stable(action.expected)) {
    throw new Error(`${label}: ${jsonPath(action.path)} exact array drifted`);
  }
  candidate.reverse();
  return root;
}

function mismatchPaths(
  before: unknown,
  after: unknown,
  path = "$",
): readonly string[] {
  if (stable(before) === stable(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, index) => index).flatMap((index) =>
      mismatchPaths(before[index], after[index], `${path}[${String(index)}]`)
    );
  }
  if (
    before !== null && typeof before === "object" && !Array.isArray(before) &&
    after !== null && typeof after === "object" && !Array.isArray(after)
  ) {
    return [...new Set([
      ...Object.keys(before as Readonly<Record<string, unknown>>),
      ...Object.keys(after as Readonly<Record<string, unknown>>),
    ])]
      .sort()
      .flatMap((key) => mismatchPaths(
        (before as Readonly<Record<string, unknown>>)[key],
        (after as Readonly<Record<string, unknown>>)[key],
        `${path}.${key}`,
      ));
  }
  return [path];
}

function boundProjection(
  envelope: V0ConformanceCaseEnvelope,
  fixtureRecordSha256: string,
  result: V0CanonicalJson,
): V0CanonicalJson {
  return {
    caseId: envelope.caseId,
    fixtureRecordSha256,
    channel: envelope.channel,
    result,
  };
}

export function materializeV0MutationCase(
  caseId: string,
  fixtureRecordSha256: string,
): V0MaterializedCaseObservation {
  if (!/^[0-9a-f]{64}$/u.test(fixtureRecordSha256)) {
    throw new Error(`${caseId}: invalid fixture record SHA-256`);
  }
  const envelope = executeV0ConformanceCase(caseId);
  const baselineAccepted =
    envelope.baselineAccepted &&
    evaluateV0ConformanceProjection(envelope, envelope.actualProjection);
  if (
    !baselineAccepted ||
    stable(envelope.actualProjection) !== stable(envelope.expectedProjection)
  ) {
    throw new Error(`${caseId}: executed baseline failed its fixture oracle`);
  }
  return Object.freeze({
    envelope,
    fixtureRecordSha256,
    beforeProjection: boundProjection(
      envelope,
      fixtureRecordSha256,
      envelope.actualProjection,
    ),
    expectedProjection: boundProjection(
      envelope,
      fixtureRecordSha256,
      envelope.expectedProjection,
    ),
    baselineAccepted: true,
  });
}

export function applyV0SemanticCounterfactual(
  observation: V0MaterializedCaseObservation,
  spec: V0SemanticMutationSpec,
): V0AppliedSemanticCounterfactual {
  const { envelope } = observation;
  const operation = spec.cases[envelope.caseId];
  if (operation === undefined) {
    throw new Error(`${spec.controlId}/${envelope.caseId}: exact operation missing`);
  }
  if (operation.actions.length === 0) {
    throw new Error(`${spec.controlId}/${envelope.caseId}: empty operation`);
  }
  let mutatedResult = clone(envelope.actualProjection);
  for (const [index, action] of operation.actions.entries()) {
    mutatedResult = applyAction(
      mutatedResult,
      action,
      `${spec.controlId}/${envelope.caseId}/action-${String(index + 1)}`,
    );
  }
  const afterProjection = boundProjection(
    envelope,
    observation.fixtureRecordSha256,
    mutatedResult,
  );
  const affectedPaths = mismatchPaths(
    observation.beforeProjection,
    afterProjection,
  );
  const baselineAccepted = evaluateV0ConformanceProjection(
    envelope,
    envelope.actualProjection,
  );
  const mutantAccepted = evaluateV0ConformanceProjection(envelope, mutatedResult);
  const beforeBinding = observation.beforeProjection as Readonly<{
    caseId: string;
    fixtureRecordSha256: string;
    channel: string;
  }>;
  const afterBinding = afterProjection as Readonly<{
    caseId: string;
    fixtureRecordSha256: string;
    channel: string;
  }>;
  const caseBindingPreserved =
    beforeBinding.caseId === afterBinding.caseId &&
    beforeBinding.fixtureRecordSha256 === afterBinding.fixtureRecordSha256 &&
    beforeBinding.channel === afterBinding.channel;
  if (
    !baselineAccepted || mutantAccepted ||
    !caseBindingPreserved || affectedPaths.length === 0
  ) {
    throw new Error(
      `${spec.controlId}/${envelope.caseId}: incoherent exact counterfactual`,
    );
  }
  const targetPath = operation.actions.length === 1
    ? operation.actions[0]?.kind === "replace-entire-projection"
      ? "$.result"
      : operation.actions[0]?.kind === "remove-matching-array-entry" ||
        operation.actions[0]?.kind === "insert-exact-array-entry"
      ? `$.result${jsonPath(operation.actions[0].arrayPath).slice(1)}`
      : `$.result${jsonPath(operation.actions[0]?.path ?? []).slice(1)}`
    : "$.result";
  return Object.freeze({
    beforeProjection: observation.beforeProjection,
    afterProjection,
    expectedProjection: observation.expectedProjection,
    baselineDetectorProjection: observation.beforeProjection,
    mutantDetectorProjection: afterProjection,
    targetPath,
    affectedPaths,
    affectedCount: affectedPaths.length,
    baselineAccepted: true,
    mutantAccepted: false,
    caseBindingPreserved: true,
    outOfScopeMismatchPaths: [] as const,
    mutationOperation: Object.freeze({
      algorithm: spec.algorithm,
      semanticFault: operation.semanticFault,
      selectorContract: operation.selectorContract,
      actions: operation.actions,
    }),
  });
}

/**
 * Build the closed V0 operator registry from independently materialized fixture
 * projections. Every direct pair names an exact path (or exact whole
 * projection), and every action stores the baseline value it must observe.
 */
export function buildV0SemanticMutationSpecs(
  expectedByCase: ReadonlyMap<string, V0CanonicalJson>,
): readonly V0SemanticMutationSpec[] {
  const definitions: V0SemanticMutationSpec[] = [];
  const expected = (caseId: string): V0CanonicalJson => {
    const value = expectedByCase.get(caseId);
    if (value === undefined) throw new Error(`${caseId}: fixture projection missing`);
    return value;
  };
  const expectedAt = (caseId: string, path: V0JsonPath): V0CanonicalJson =>
    clone(readPath(expected(caseId), path, `${caseId}/fixture`) as V0CanonicalJson);
  const expectedArrayAt = (
    caseId: string,
    path: V0JsonPath,
  ): readonly V0CanonicalJson[] => {
    const value = expectedAt(caseId, path);
    if (!Array.isArray(value)) {
      throw new Error(`${caseId}: ${jsonPath(path)} fixture array missing`);
    }
    return value as readonly V0CanonicalJson[];
  };
  const replace = (
    caseId: string,
    path: V0JsonPath,
    replacement: V0CanonicalJson,
  ): ExactReplaceAction => ({
    kind: "replace-exact",
    path,
    expected: expectedAt(caseId, path),
    replacement,
  });
  const remove = (
    arrayPath: V0JsonPath,
    predicatePath: V0JsonPath,
    expectedPredicateValue: V0CanonicalJson,
  ): RemoveMatchingAction => ({
    kind: "remove-matching-array-entry",
    arrayPath,
    predicatePath,
    expectedPredicateValue,
    expectedMatchCount: 1,
  });
  const insert = (
    arrayPath: V0JsonPath,
    expectedLength: number,
    index: number,
    value: V0CanonicalJson,
  ): InsertExactAction => ({
    kind: "insert-exact-array-entry",
    arrayPath,
    expectedLength,
    index,
    value,
  });
  const whole = (
    caseId: string,
    replacement: V0CanonicalJson,
  ): ReplaceEntireProjectionAction => ({
    kind: "replace-entire-projection",
    expected: expected(caseId),
    replacement,
  });
  const operation = (
    semanticFault: string,
    selectorContract: string,
    actions: readonly V0ExactMutationAction[],
  ): V0ExactCaseMutation => ({ semanticFault, selectorContract, actions });
  const add = (
    controlId: string,
    algorithm: string,
    reviewedInvariant: string,
    cases: Readonly<Record<string, V0ExactCaseMutation>>,
  ): void => {
    definitions.push({ controlId, algorithm, reviewedInvariant, cases });
  };
  const cell = (index: number, ...path: V0JsonPathPart[]): V0JsonPath =>
    ["cells", index, ...path];
  const generatedFault = (
    caseId: string,
    fault: string,
    fields: Readonly<Record<string, V0CanonicalJson>> = {},
  ): V0CanonicalJson => ({
    caseId,
    ok: true,
    kind: "generated",
    exactCandidatePresent: true,
    semanticCounterfactual: fault,
    ...fields,
  });
  const externalBassVoice: V0CanonicalJson = {
    degree: null,
    midi: 51,
    provenance: "external-bass",
    sourceDegreeIndex: null,
    spelling: { alter: -1, octave: 3, step: "E" },
  };
  const displacedSlashVoice: V0CanonicalJson = {
    degree: null,
    midi: 75,
    provenance: "slash-bass",
    sourceDegreeIndex: null,
    spelling: { alter: -1, octave: 5, step: "E" },
  };
  const cRootVoice: V0CanonicalJson = {
    degree: "1",
    midi: 60,
    provenance: "realization",
    sourceDegreeIndex: 0,
    spelling: { alter: 0, octave: 4, step: "C" },
  };
  const wrongSourceDrop2Voices: V0CanonicalJson = [
    {
      degree: "7",
      midi: 47,
      provenance: "realization",
      sourceDegreeIndex: 3,
      spelling: { alter: 0, octave: 2, step: "B" },
    },
    {
      degree: "5",
      midi: 55,
      provenance: "realization",
      sourceDegreeIndex: 2,
      spelling: { alter: 0, octave: 3, step: "G" },
    },
    {
      degree: "1",
      midi: 60,
      provenance: "realization",
      sourceDegreeIndex: 0,
      spelling: { alter: 0, octave: 4, step: "C" },
    },
    {
      degree: "3",
      midi: 64,
      provenance: "realization",
      sourceDegreeIndex: 1,
      spelling: { alter: 0, octave: 4, step: "E" },
    },
  ];
  const twoOctaveDrop2Voices: V0CanonicalJson = [
    {
      degree: "1",
      midi: 36,
      provenance: "realization",
      sourceDegreeIndex: 0,
      spelling: { alter: 0, octave: 2, step: "C" },
    },
    ...expectedArrayAt("V0-CAND-004", ["voices"]).slice(1),
  ];
  const untransformedDrop2Voices: V0CanonicalJson = [
    {
      degree: "5",
      midi: 55,
      provenance: "realization",
      sourceDegreeIndex: 2,
      spelling: { alter: 0, octave: 3, step: "G" },
    },
    {
      degree: "7",
      midi: 59,
      provenance: "realization",
      sourceDegreeIndex: 3,
      spelling: { alter: 0, octave: 3, step: "B" },
    },
    {
      degree: "1",
      midi: 60,
      provenance: "realization",
      sourceDegreeIndex: 0,
      spelling: { alter: 0, octave: 4, step: "C" },
    },
    {
      degree: "3",
      midi: 64,
      provenance: "realization",
      sourceDegreeIndex: 1,
      spelling: { alter: 0, octave: 4, step: "E" },
    },
  ];

  add("V0-MUT-001", "omit-identity-tone", "source-triad identity is present", {
    "V0-CAND-017": operation("remove the suspension identity voice", "voices has exactly one degree 4", [remove(["voices"], ["degree"], "4")]),
    "V0-IDENTITY-NEAR-001": operation("remove the executed suspension identity degree", "suspendedFourDegrees has exactly one degree 4 and the named identity detector is true", [
      remove(["suspendedFourDegrees"], [], "4"),
      replace("V0-IDENTITY-NEAR-001", ["suspendedFourIdentityPresent"], false),
    ]),
  });
  add("V0-MUT-002", "omit-guide-third", "the exact third or suspension guide is present", {
    "V0-CAND-001": operation("remove the exact third guide voice", "voices has exactly one degree 3", [remove(["voices"], ["degree"], "3")]),
    "V0-GUIDE-NEAR-001": operation("remove the observed third guide", "required guides are [3,b7], observed guides are [3], and b7 is already missing", [
      replace("V0-GUIDE-NEAR-001", ["observedGuideDegrees"], []),
      replace("V0-GUIDE-NEAR-001", ["missingGuideDegrees"], ["3", "b7"]),
    ]),
  });
  add("V0-MUT-003", "omit-seventh-guide", "the quality-defining seventh guide is present", {
    "V0-CAND-001": operation("remove the exact seventh guide voice", "voices has exactly one degree 7", [remove(["voices"], ["degree"], "7")]),
    "V0-GUIDE-NEAR-001": operation("silently accept the executed missing b7 guide", "missingGuideDegrees is exactly [b7] and the omission reason is observed", [
      replace("V0-GUIDE-NEAR-001", ["missingGuideDegrees"], []),
      replace("V0-GUIDE-NEAR-001", ["guideOmissionReasonObserved"], false),
    ]),
  });
  add("V0-MUT-004", "promote-optional-fifth", "an ordinary fifth keeps its declared optional role", {
    "V0-CAND-002": operation("promote the source fifth role to mandatory", "sourceRoles.ordinaryFifthRole is exactly optional", [replace("V0-CAND-002", ["sourceRoles", "ordinaryFifthRole"], "mandatory")]),
    "V0-CAND-013": operation("promote the source fifth role to mandatory", "sourceRoles.ordinaryFifthRole is exactly optional", [replace("V0-CAND-013", ["sourceRoles", "ordinaryFifthRole"], "mandatory")]),
  });
  add("V0-MUT-005", "fabricate-template-color", "a template cannot invent a degree absent from the realization", Object.fromEntries(
    ["V0-CAND-019", "V0-CAND-020", "V0-CAND-021", "V0-CAND-023"].map((caseId) => [
      caseId,
      operation("accept a generated candidate by fabricating the absent template color", "replace the exact typed template-degree-absent refusal", [whole(caseId, generatedFault(caseId, "fabricated-template-color", { fabricatedAbsentDegree: true }))]),
    ]),
  ));
  add("V0-MUT-006", "normalize-sharp-nine-to-flat-three", "sharp nine remains exact degree #9", {
    "V0-SPELL-NEAR-001": operation("collapse the sharp-nine identity and spelling to flat-three", "left witness is exactly #9/D-sharp", [
      replace("V0-SPELL-NEAR-001", ["left", "token"], "b3"),
      replace("V0-SPELL-NEAR-001", ["left", "spelling", "step"], "E"),
      replace("V0-SPELL-NEAR-001", ["left", "spelling", "alter"], -1),
      replace("V0-SPELL-NEAR-001", ["degreeTokensDistinct"], false),
      replace("V0-SPELL-NEAR-001", ["spellingsDistinct"], false),
    ]),
    "V0-TRANS-012": operation("normalize #9 in every executed root cell to b3", "all 12 ordered-degree projections end in #9", Array.from({ length: 12 }, (_, index) => replace("V0-TRANS-012", cell(index, "orderedDegrees", 4), "b3"))),
    "V0-TRANS-013": operation("normalize #9 in every executed root cell to b3", "all 12 ordered-degree projections end in #9", Array.from({ length: 12 }, (_, index) => replace("V0-TRANS-013", cell(index, "orderedDegrees", 4), "b3"))),
  });
  add("V0-MUT-007", "normalize-double-flat-seven-to-six", "double-flat seven remains exact degree bb7", {
    "V0-CAND-016": operation("normalize the diminished-seventh voice to A-natural degree six", "fourth voice is exactly B-double-flat/bb7 at MIDI 69", [
      replace("V0-CAND-016", ["voices", 3, "degree"], "6"),
      replace("V0-CAND-016", ["voices", 3, "spelling", "step"], "A"),
      replace("V0-CAND-016", ["voices", 3, "spelling", "alter"], 0),
    ]),
    "V0-TRANS-005": operation("normalize bb7 in every executed root cell to degree six", "all 12 ordered-degree projections end in bb7", Array.from({ length: 12 }, (_, index) => replace("V0-TRANS-005", cell(index, "orderedDegrees", 3), "6"))),
  });
  add("V0-MUT-008", "respell-after-register-lift", "register lift preserves written step and alteration", {
    "V0-CAND-008": operation("respell the lifted E-flat voice as enharmonic D-sharp", "b3 voice is exactly E-flat in the selected register", [
      replace("V0-CAND-008", ["voices", 2, "spelling", "step"], "D"),
      replace("V0-CAND-008", ["voices", 2, "spelling", "alter"], 1),
    ]),
    "V0-SPELL-NEAR-002": operation("recompute the upper register spelling through B-sharp", "upper spelling is exactly C-natural 5", [
      replace("V0-SPELL-NEAR-002", ["upperSpelling", "step"], "B"),
      replace("V0-SPELL-NEAR-002", ["upperSpelling", "alter"], 1),
      replace("V0-SPELL-NEAR-002", ["upperSpelling", "octave"], 4),
      replace("V0-SPELL-NEAR-002", ["stepPreserved"], false),
      replace("V0-SPELL-NEAR-002", ["alterPreserved"], false),
    ]),
  });
  add("V0-MUT-009", "accept-duplicate-midi", "exact MIDI unison is refused", {
    "V0-UNISON-NEAR-001": operation(
      "accept the exact duplicate-MIDI production refusal as generated",
      "replace the exact fixture-bound unique_midi refusal projection",
      [whole(
        "V0-UNISON-NEAR-001",
        generatedFault("V0-UNISON-NEAR-001", "duplicate-midi-accepted", {
          duplicateMidiAccepted: true,
        }),
      )],
    ),
  });
  add("V0-MUT-010", "accept-undeclared-octave-copy", "only explicitly declared octave doubling is admitted", {
    "V0-CAND-015": operation("erase the declared doubling provenance from the octave copy", "third voice is the declared doubling", [replace("V0-CAND-015", ["voices", 2, "provenance"], "realization")]),
    "V0-DOUBLING-NEAR-001": operation(
      "accept the exact altered-degree doubling production refusal as generated",
      "replace the exact fixture-bound doubling-not-permitted refusal projection",
      [whole(
        "V0-DOUBLING-NEAR-001",
        generatedFault("V0-DOUBLING-NEAR-001", "altered-doubling-accepted", {
          alteredDoublingAccepted: true,
        }),
      )],
    ),
  });
  add("V0-MUT-011", "wrong-generated-voice-count", "generated voice count equals the request count", {
    "V0-CAND-013": operation("drop one generated voice from the four-voice result", "voices has exactly one terminal degree-7 voice", [remove(["voices"], ["degree"], "7")]),
    "V0-COUNT-NEAR-001": operation("drop one generated degree-bearing voice", "actualVoiceCount is four and degreeBearingVoiceCount is three", [
      replace("V0-COUNT-NEAR-001", ["actualVoiceCount"], 3),
      replace("V0-COUNT-NEAR-001", ["degreeBearingVoiceCount"], 2),
    ]),
  });
  add("V0-MUT-012", "sound-external-bass", "external bass is named but excluded from sounded voices", {
    "V0-CAND-014": operation("insert and count the external E-flat bass as a sounded voice", "four voices exclude external bass and externalBassVoiceCounted is false", [
      insert(["voices"], 4, 0, externalBassVoice),
      replace("V0-CAND-014", ["externalBassVoiceCounted"], true),
    ]),
    "V0-COUNT-NEAR-002": operation("insert and count the external E-flat bass", "actualVoiceCount is four and externalBassSoundingVoiceCount is zero", [
      replace("V0-COUNT-NEAR-002", ["actualVoiceCount"], 5),
      replace("V0-COUNT-NEAR-002", ["externalBassSoundingVoiceCount"], 1),
    ]),
  });
  add("V0-MUT-013", "slash-bass-not-lowest", "generated slash bass is the unique lowest voice", {
    "V0-CAND-013": operation("move the slash-bass voice above every chord voice", "one slash-bass voice is first at MIDI 51", [
      remove(["voices"], ["provenance"], "slash-bass"),
      insert(["voices"], 3, 3, displacedSlashVoice),
    ]),
    "V0-SLASH-NEAR-001": operation("accept a generated result after placing the slash bass above every chord voice", "exact fixture-bound slash-bass-unplaceable refusal", [whole("V0-SLASH-NEAR-001", {
      caseId: "V0-SLASH-NEAR-001",
      ok: true,
      valuePresent: true,
      slashBassUnplaceable: false,
      reasons: [],
      termination: "complete-generated",
      semanticCounterfactual: "slash-bass-not-lowest",
    })]),
  });
  add("V0-MUT-014", "accept-enharmonic-slash-spelling", "generated slash bass preserves exact source spelling", {
    "V0-CAND-013": operation("respell the E-flat slash bass as D-sharp", "first voice spelling is exactly E-flat", [
      replace("V0-CAND-013", ["voices", 0, "spelling", "step"], "D"),
      replace("V0-CAND-013", ["voices", 0, "spelling", "alter"], 1),
    ]),
    "V0-SLASH-NEAR-002": operation("accept the executed D-sharp same-pitch-class substitute", "mutant D-sharp is pinned and rejected by the exact-spelling law", [
      replace("V0-SLASH-NEAR-002", ["mutantAcceptedByExactSpellingLaw"], true),
    ]),
  });
  add("V0-MUT-015", "allow-slash-none", "a slash chord with bassPolicy none is refused", {
    "V0-SLASH-NEAR-003": operation("accept the executed slash chord whose bass policy is none", "exact none-policy refusal projection", [whole("V0-SLASH-NEAR-003", {
      caseId: "V0-SLASH-NEAR-003",
      requestBassPolicy: "none",
      sourceHasSlashBass: true,
      primaryReason: null,
      bassPolicyUnsupported: false,
      accepted: true,
    })]),
  });
  add("V0-MUT-016", "allow-rootless-nonexternal", "Rootless accepts only external bass policy", {
    "V0-ROOTLESS-NEAR-001": operation("accept generated and none bass policies for Rootless", "both executed policies refuse with bass-policy-unsupported", [whole("V0-ROOTLESS-NEAR-001", {
      caseId: "V0-ROOTLESS-NEAR-001",
      generatedReasons: [],
      noneReasons: [],
      generatedPrimaryReason: null,
      nonePrimaryReason: null,
      generatedAccepted: true,
      noneAccepted: true,
    })]),
  });
  add("V0-MUT-017", "insert-root-into-rootless", "Rootless output omits exact degree 1", {
    "V0-CAND-006": operation("insert a source-root voice into Rootless A", "four-voice Rootless A output has no degree 1", [insert(["voices"], 4, 0, cRootVoice)]),
    "V0-CAND-007": operation("insert a source-root voice into Rootless B", "four-voice Rootless B output has no degree 1", [insert(["voices"], 4, 1, cRootVoice)]),
  });

  add("V0-MUT-018", "drop-second-from-bottom", "Drop-2 lowers the second voice from the top", {
    "V0-CAND-004": operation("lower the second closed-source voice from the bottom", "Drop-2 evidence and output encode source ordinal 2 lowered to C3", [
      replace("V0-CAND-004", ["drop2", "secondFromTopSourceOrdinal"], 1),
      replace("V0-CAND-004", ["drop2", "transformedMidi"], [47, 55, 60, 64]),
      replace("V0-CAND-004", ["voices"], wrongSourceDrop2Voices),
    ]),
    "V0-DROP2-NEAR-001": operation("accept lowering the second closed-source voice from the bottom", "counterfactual ordinal one is pinned and rejected", [
      replace("V0-DROP2-NEAR-001", ["counterfactualAccepted"], true),
    ]),
  });
  add("V0-MUT-019", "drop-two-octaves", "Drop-2 lowers by exactly twelve semitones", {
    "V0-CAND-004": operation("lower the selected Drop-2 source by two octaves", "Drop-2 evidence and output lower C4 to C3 by exactly 12", [
      replace("V0-CAND-004", ["drop2", "loweredBySemitones"], 24),
      replace("V0-CAND-004", ["drop2", "transformedMidi"], [36, 55, 59, 64]),
      replace("V0-CAND-004", ["voices"], twoOctaveDrop2Voices),
    ]),
    "V0-DROP2-NEAR-002": operation("accept lowering the selected Drop-2 source by two octaves", "counterfactual lowering 24 is pinned and rejected", [
      replace("V0-DROP2-NEAR-002", ["counterfactualAccepted"], true),
    ]),
  });
  add("V0-MUT-020", "label-generic-spread-drop2", "Drop-2 requires the literal closed-source transform", {
    "V0-CAND-003": operation("relabel the executed Open spread as Drop-2", "realized family is exactly open", [replace("V0-CAND-003", ["realizedFamily"], "drop2")]),
    "V0-CAND-004": operation("return the untransformed closed spread while retaining the Drop-2 label", "Drop-2 evidence and output encode the literal octave displacement", [
      replace("V0-CAND-004", ["drop2", "loweredBySemitones"], 0),
      replace("V0-CAND-004", ["drop2", "transformedMidi"], [55, 59, 60, 64]),
      replace("V0-CAND-004", ["voices"], untransformedDrop2Voices),
    ]),
    "V0-CAND-025": operation("accept a three-voice generic spread under the Drop-2 label", "exact voice-count-below-template-minimum refusal", [whole("V0-CAND-025", generatedFault("V0-CAND-025", "generic-spread-relabeled-drop2", {
      requestedFamily: "drop2",
      realizedFamily: "drop2",
      genericSpreadRelabeledAsDrop2: true,
    }))]),
  });
  add("V0-MUT-021", "skip-drop2-revalidation", "transformed Drop-2 output is revalidated", {
    "V0-DROP2-NEAR-003": operation("accept the structurally invalid transform without revalidation", "named range and spacing revalidation facts refuse the result", [
      replace("V0-DROP2-NEAR-003", ["familyTransformRevalidated"], false),
      replace("V0-DROP2-NEAR-003", ["rangeConstraintRefused"], false),
      replace("V0-DROP2-NEAR-003", ["spacingConstraintRefused"], false),
      replace("V0-DROP2-NEAR-003", ["ok"], true),
      replace("V0-DROP2-NEAR-003", ["valuePresent"], true),
      replace("V0-DROP2-NEAR-003", ["termination"], "complete-generated"),
    ]),
  });
  add("V0-MUT-022", "allow-quartal-without-evidence", "Quartal requires non-null reviewed context", {
    "V0-CAND-026": operation("accept Quartal generation with null context", "exact quartal-context-required refusal", [whole("V0-CAND-026", generatedFault("V0-CAND-026", "quartal-without-evidence", {
      requestedFamily: "quartal",
      realizedFamily: "quartal",
      quartalContextPresent: false,
    }))]),
  });
  add("V0-MUT-023", "accept-tertian-as-quartal", "Quartal adjacency is a declared fourth stack", {
    "V0-CAND-027": operation("accept the executed tertian sequence as Quartal", "exact adjacency-not-fourth refusal", [whole("V0-CAND-027", generatedFault("V0-CAND-027", "tertian-accepted-as-quartal", {
      requestedFamily: "quartal",
      realizedFamily: "quartal",
    }))]),
  });
  add("V0-MUT-024", "accept-incompatible-context", "every Quartal context compatibility check is enforced", {
    "V0-CAND-027": operation("accept the executed incompatible tertian context", "exact adjacency incompatibility refusal", [whole("V0-CAND-027", generatedFault("V0-CAND-027", "incompatible-quartal-context-accepted"))]),
    "V0-CAND-028": operation("accept the executed context containing an absent degree", "exact degree-absent incompatibility refusal", [whole("V0-CAND-028", generatedFault("V0-CAND-028", "incompatible-quartal-context-accepted"))]),
    "V0-ID-004-257-ASCII-REFUSED": operation("accept the 257-code-point context identifier", "identifier projection records the maximum-code-points violation", [
      replace("V0-ID-004-257-ASCII-REFUSED", ["valid"], true),
      replace("V0-ID-004-257-ASCII-REFUSED", ["candidateEvidenceMayBeEmitted"], true),
      replace("V0-ID-004-257-ASCII-REFUSED", ["quartalContextDisposition"], "accept-id-shape"),
      replace("V0-ID-004-257-ASCII-REFUSED", ["firstViolation"], null),
    ]),
    "V0-ID-006-513-BYTES-REFUSED": operation("accept the 513-byte context identifier", "identifier projection records the maximum-utf8-bytes violation", [
      replace("V0-ID-006-513-BYTES-REFUSED", ["valid"], true),
      replace("V0-ID-006-513-BYTES-REFUSED", ["candidateEvidenceMayBeEmitted"], true),
      replace("V0-ID-006-513-BYTES-REFUSED", ["quartalContextDisposition"], "accept-id-shape"),
      replace("V0-ID-006-513-BYTES-REFUSED", ["firstViolation"], null),
    ]),
  });
  add("V0-MUT-025", "silently-select-alt-variant", "the exact requested realization ID is selected", {
    "V0-CAND-012": operation("silently realize the sharp-nine/sharp-five variant", "request and result both name alt-b9-b5", [
      replace("V0-CAND-012", ["realizedRealizationId"], "alt-sharp9-sharp5"),
      replace("V0-CAND-012", ["voices", 2, "degree"], "#5"),
      replace("V0-CAND-012", ["voices", 2, "midi"], 68),
      replace("V0-CAND-012", ["voices", 2, "spelling", "alter"], 1),
      replace("V0-CAND-012", ["voices", 4, "degree"], "#9"),
      replace("V0-CAND-012", ["voices", 4, "midi"], 75),
      replace("V0-CAND-012", ["voices", 4, "spelling", "alter"], 1),
    ]),
    "V0-CAND-030": operation("silently choose literal when the requested altered ID is unavailable", "exact realization-unavailable refusal", [whole("V0-CAND-030", generatedFault("V0-CAND-030", "silent-fallback-realization-selection", {
      requestedRealizationId: "alt-b9-b5",
      realizedRealizationId: "literal",
    }))]),
  });
  add("V0-MUT-026", "merge-alt-variants", "altered realization identities remain distinct", {
    "V0-CAND-012": operation("mark another altered realization as merged into the selected output", "noOtherAlteredRealizationMerged is exactly true", [replace("V0-CAND-012", ["noOtherAlteredRealizationMerged"], false)]),
    "V0-ALT-NEAR-001": operation("merge two altered realization identity keys", "the first two named realization identity keys are distinct", [
      replace("V0-ALT-NEAR-001", ["realizations", 1, "identityKey"], expectedAt("V0-ALT-NEAR-001", ["realizations", 0, "identityKey"])),
      replace("V0-ALT-NEAR-001", ["identityKeysDistinct"], false),
    ]),
  });
  add("V0-MUT-027", "generate-manual", "Manual voicing bypasses generation", {
    "V0-CAND-031": operation("run candidate generation for the Manual request", "exact stored Manual bypass projection", [whole("V0-CAND-031", generatedFault("V0-CAND-031", "manual-candidate-generation", {
      candidateGenerationPerformed: true,
      sameObjectValue: false,
      termination: "complete-generated",
    }))]),
    "V0-BYPASS-NEAR-001": operation("run candidate generation for the Manual request", "named bypass facts report no generation, zero counters, and reference preservation", [
      replace("V0-BYPASS-NEAR-001", ["candidateGenerationPerformed"], true),
      replace("V0-BYPASS-NEAR-001", ["sameVoicingObjectReference"], false),
      replace("V0-BYPASS-NEAR-001", ["allNumericCountersZero"], false),
      replace("V0-BYPASS-NEAR-001", ["rawCandidateCount"], 1),
      replace("V0-BYPASS-NEAR-001", ["retainedCandidateCount"], 1),
      replace("V0-BYPASS-NEAR-001", ["termination"], "complete-generated"),
    ]),
  });
  add("V0-MUT-028", "regenerate-frozen", "Frozen pitches and metadata are preserved", {
    "V0-CAND-032": operation("regenerate the Frozen request", "exact stored Frozen bypass projection", [whole("V0-CAND-032", generatedFault("V0-CAND-032", "frozen-regeneration", {
      candidateGenerationPerformed: true,
      sameObjectValue: false,
      termination: "complete-generated",
    }))]),
    "V0-BYPASS-NEAR-002": operation("regenerate the Frozen request", "named bypass facts report no generation, zero counters, and reference preservation", [
      replace("V0-BYPASS-NEAR-002", ["candidateGenerationPerformed"], true),
      replace("V0-BYPASS-NEAR-002", ["sameVoicingObjectReference"], false),
      replace("V0-BYPASS-NEAR-002", ["generatedByObjectReferencePreserved"], false),
      replace("V0-BYPASS-NEAR-002", ["allNumericCountersZero"], false),
      replace("V0-BYPASS-NEAR-002", ["rawCandidateCount"], 1),
      replace("V0-BYPASS-NEAR-002", ["retainedCandidateCount"], 1),
      replace("V0-BYPASS-NEAR-002", ["termination"], "complete-generated"),
    ]),
  });
  add("V0-MUT-029", "fallback-to-c-major", "no-result paths return a typed refusal without a value", {
    "V0-CAND-019": operation("replace the typed no-result with a C-major fallback", "exact absent-color refusal", [whole("V0-CAND-019", generatedFault("V0-CAND-019", "c-major-fallback", { fallbackSymbol: "Cmaj" }))]),
    "V0-CAND-029": operation("replace the narrow-range no-result with a C-major fallback", "exact range-insufficient refusal", [whole("V0-CAND-029", generatedFault("V0-CAND-029", "c-major-fallback", { fallbackSymbol: "Cmaj" }))]),
    "V0-FALLBACK-NEAR-001": operation("replace the no-result with a C-major candidate fallback", "named direct projection is an exact range-insufficient refusal without fallback", [
      replace("V0-FALLBACK-NEAR-001", ["candidateFallbackPresent"], true),
      replace("V0-FALLBACK-NEAR-001", ["ok"], true),
      replace("V0-FALLBACK-NEAR-001", ["valuePresent"], true),
      replace("V0-FALLBACK-NEAR-001", ["reasons"], []),
      replace("V0-FALLBACK-NEAR-001", ["refusalCode"], null),
      replace("V0-FALLBACK-NEAR-001", ["termination"], "complete-generated"),
    ]),
  });
  add("V0-MUT-030", "range-boundary-off-by-one", "MIDI range endpoints are exactly inclusive", {
    "V0-RANGE-BOUNDARY-001": operation("refuse the inclusive MIDI-zero endpoint", "domainMidiMinimumAccepted is exactly true", [replace("V0-RANGE-BOUNDARY-001", ["domainMidiMinimumAccepted"], false)]),
    "V0-RANGE-NEAR-001": operation("accept the one-semitone-below MIDI endpoint", "belowDomainAccepted is exactly false", [replace("V0-RANGE-NEAR-001", ["belowDomainAccepted"], true)]),
  });
  for (const caseId of [
    "V0-SPACING-BOUNDARY-001",
    "V0-SPACING-BOUNDARY-002",
    "V0-SPACING-BOUNDARY-003",
    "V0-SPACING-BOUNDARY-004",
  ]) {
    const existing = definitions.find(({ controlId }) => controlId === "V0-MUT-031");
    const caseMutation = operation("invert the inclusive spacing comparator to reject the exact minimum", "accepted is true and violationCount is zero", [
      replace(caseId, ["accepted"], false),
      replace(caseId, ["violationCount"], 1),
    ]);
    if (existing === undefined) {
      add("V0-MUT-031", "invert-spacing-comparison", "adjacent interval passes exactly when it meets the band minimum", { [caseId]: caseMutation });
    } else {
      (existing as { cases: Record<string, V0ExactCaseMutation> }).cases[caseId] = caseMutation;
    }
  }
  const spacingSpec = definitions.find(({ controlId }) => controlId === "V0-MUT-031");
  if (spacingSpec === undefined) throw new Error("V0-MUT-031 construction failed");
  (spacingSpec as { cases: Record<string, V0ExactCaseMutation> }).cases["V0-SPACING-NEAR-001"] = operation(
    "invert the spacing comparator to accept the one-semitone near miss",
    "accepted is false and violationCount is one",
    [
      replace("V0-SPACING-NEAR-001", ["accepted"], true),
      replace("V0-SPACING-NEAR-001", ["violationCount"], 0),
    ],
  );
  add("V0-MUT-032", "randomize-final-order", "final candidate order is deterministic", {
    "V0-ORDER-001": operation("randomize the frozen local-score axis order", "order is the exact six-axis precedence list", [
      replace("V0-ORDER-001", ["order"], [...expectedArrayAt("V0-ORDER-001", ["order"])].reverse()),
    ]),
    "V0-ORDER-NEAR-001": operation("make final ordering change under reversed input or locale", "reversed enumeration and hostile locale both restore the original order", [
      replace("V0-ORDER-NEAR-001", ["reversedEnumerationRestored"], false),
      replace("V0-ORDER-NEAR-001", ["hostileLocaleEnumerationRestored"], false),
      replace("V0-ORDER-NEAR-001", ["hostileLocaleReplayEqual"], false),
    ]),
  });
  add("V0-MUT-033", "raw-cap-off-by-one", "raw candidate cap is exactly 96 inclusive", {
    "V0-LIMIT-WORK-008-EXACT": operation("treat raw candidate 96 as over a cap of 95", "exact inclusive-96 acceptance", [whole("V0-LIMIT-WORK-008-EXACT", {
      caseId: "V0-LIMIT-WORK-008-EXACT",
      ok: false,
      valuePresent: false,
      evidenceProjection: { counter: "rawCandidatesProduced", acceptedValue: 95, termination: "work-limit-exceeded" },
      refusal: { code: "limit.voicing_work_exceeded", path: [], counter: "rawCandidatesProduced", received: 96, maximum: 95, partialResult: false },
      limitDisposition: "refuse-before-accepting-attempted-unit",
    })]),
    "V0-LIMIT-WORK-008-PLUS-ONE": operation("accept raw candidate 97 under a cap of 97", "exact attempted-97 work-limit refusal", [whole("V0-LIMIT-WORK-008-PLUS-ONE", {
      caseId: "V0-LIMIT-WORK-008-PLUS-ONE",
      evidenceProjection: { counter: "rawCandidatesProduced", acceptedValue: 97 },
      limitDisposition: "accepted-at-inclusive-maximum",
      limitRefusal: null,
      overallOperationOutcomeFixedByThisCase: false,
    })]),
    "V0-RETENTION-003-RAW-EXACT-96": operation("truncate raw generation at 95", "exact raw-cap-96 acceptance", [whole("V0-RETENTION-003-RAW-EXACT-96", {
      caseId: "V0-RETENTION-003-RAW-EXACT-96",
      rawCandidatesProduced: 95,
      rawLimitDisposition: "truncated-at-mutant-cap-95",
      retainedCandidateCountMaximum: 24,
      workLimitRefusal: null,
    })]),
    "V0-RETENTION-004-RAW-ATTEMPT-97": operation("accept attempted raw candidate 97", "exact attempted-97 work-limit refusal", [whole("V0-RETENTION-004-RAW-ATTEMPT-97", {
      caseId: "V0-RETENTION-004-RAW-ATTEMPT-97",
      ok: true,
      valuePresent: true,
      rawCandidatesProduced: 97,
      rawLimitDisposition: "accepted-at-mutant-cap-97",
    })]),
  });
  add("V0-MUT-034", "retained-cap-off-by-one", "retained candidate cap is exactly 24", {
    "V0-RETENTION-001-EXACT-24": operation("truncate the 24th retained candidate under a cap of 23", "exact retain-all-24 projection", [whole("V0-RETENTION-001-EXACT-24", {
      caseId: "V0-RETENTION-001-EXACT-24",
      retentionDisposition: "truncate-after-first-23",
      retainedCandidateCount: 23,
      retainedCandidatesProduced: 23,
      retainedOrderedIndexFirst: 0,
      retainedOrderedIndexLast: 22,
      attemptedRetainedCounterValue: null,
      workLimitRefusal: null,
    })]),
    "V0-RETENTION-002-ELIGIBLE-25-TRUNCATED": operation("retain the 25th candidate under a cap of 25", "exact truncate-after-first-24 projection", [whole("V0-RETENTION-002-ELIGIBLE-25-TRUNCATED", {
      caseId: "V0-RETENTION-002-ELIGIBLE-25-TRUNCATED",
      retentionDisposition: "retain-all-eligible",
      retainedCandidateCount: 25,
      retainedCandidatesProduced: 25,
      truncatedOrderedIndexes: [],
      attemptedRetainedCounterValue: null,
      workLimitRefusal: null,
    })]),
  });
  add("V0-MUT-035", "reverse-tie-break", "the first differing frozen comparison is ascending", {
    "V0-ORDER-001": operation("reverse the isolated local-score-axis comparison", "first axis comparison is -1 and its reverse is 1", [
      replace("V0-ORDER-001", ["comparisons", 0, "comparison"], 1),
      replace("V0-ORDER-001", ["comparisons", 0, "candidateComparison"], 1),
      replace("V0-ORDER-001", ["comparisons", 0, "reverseComparison"], -1),
    ]),
    "V0-ORDER-002": operation("reverse the isolated MIDI-sequence tie-break", "first frozen tie-break comparison is -1 and its reverse is 1", [
      replace("V0-ORDER-002", ["comparisons", 0, "comparison"], 1),
      replace("V0-ORDER-002", ["comparisons", 0, "reverseComparison"], -1),
    ]),
  });
  add("V0-MUT-036", "dedupe-by-midi-only", "candidate identity includes degree, spelling, provenance, and MIDI", {
    "V0-IDENTITY-NEAR-002": operation("collapse the distinct semantic candidate identity onto its same-MIDI peer", "identity keys differ while the MIDI projection is equal", [
      replace("V0-IDENTITY-NEAR-002", ["rightIdentity"], expectedAt("V0-IDENTITY-NEAR-002", ["leftIdentity"])),
      replace("V0-IDENTITY-NEAR-002", ["identitiesDistinct"], false),
    ]),
  });
  add("V0-MUT-037", "chromatic-only-transposition", "transposition preserves directed diatonic spelling", {
    "V0-TRANS-MATRIX-001": operation("collapse the executed D-flat root spelling to C-sharp in one matrix cell", "TRANS-012/D-flat cell is exactly D-flat at pitch class one", [
      replace("V0-TRANS-MATRIX-001", ["seeds", 11, "cells", 1, "rootSpelling", "step"], "C"),
      replace("V0-TRANS-MATRIX-001", ["seeds", 11, "cells", 1, "rootSpelling", "alter"], 1),
    ]),
    "V0-TRANS-NEAR-001": operation("collapse the D-flat enharmonic root and output spellings onto C-sharp", "first near-miss pair has distinct directed root and voice spellings", [
      replace("V0-TRANS-NEAR-001", ["pairs", 0, "rightRoot"], expectedAt("V0-TRANS-NEAR-001", ["pairs", 0, "leftRoot"])),
      replace("V0-TRANS-NEAR-001", ["pairs", 0, "rightVoiceSpellings"], expectedAt("V0-TRANS-NEAR-001", ["pairs", 0, "leftVoiceSpellings"])),
      replace("V0-TRANS-NEAR-001", ["pairs", 0, "rootSpellingsDistinct"], false),
      replace("V0-TRANS-NEAR-001", ["pairs", 0, "outputSpellingsDistinct"], false),
    ]),
  });
  add("V0-MUT-038", "break-inverse-transposition", "inverse transposition restores the complete semantic projection", {
    "V0-TRANS-MATRIX-001": operation("mark one executed matrix cell as failing inverse restoration", "first TRANS-005 seed cell restores exactly", [replace("V0-TRANS-MATRIX-001", ["seeds", 4, "cells", 0, "inverseProjectionRestored"], false)]),
    "V0-TRANS-NEAR-002": operation("break correct inverse restoration in the first one-axis case", "the correct request restores and the named detector kills its mutant", [
      replace("V0-TRANS-NEAR-002", ["oneAxisAtATime", 0, "correctInverseRequestRestored"], false),
      replace("V0-TRANS-NEAR-002", ["oneAxisAtATime", 0, "detectorKilledMutant"], false),
    ]),
  });
  add("V0-MUT-039", "mutate-request", "caller-owned request bytes remain unchanged", {
    "V0-IMMUTABLE-001": operation("mutate the caller-owned generated request", "generatedRequestUnchanged is exactly true after all mutation probes", [replace("V0-IMMUTABLE-001", ["generatedRequestUnchanged"], false)]),
  });
  add("V0-MUT-040", "return-mutable-candidates", "every reachable returned record and array is frozen", {
    "V0-IMMUTABLE-001": operation("return a reachable mutable generated candidate child", "generated output is deeply frozen and every mutation attempt fails without changing bytes", [
      replace("V0-IMMUTABLE-001", ["generatedOutputDeeplyFrozen"], false),
      replace("V0-IMMUTABLE-001", ["allMutationAttemptsFailed"], false),
      replace("V0-IMMUTABLE-001", ["outputBytesUnchanged"], false),
    ]),
    "V0-IMMUTABLE-NEAR-001": operation("accept the executed reachable mutable-child counterfactual", "named detector rejects the nested mutation that succeeds and changes bytes", [
      replace("V0-IMMUTABLE-NEAR-001", ["deepImmutabilityDetectorAccepted"], true),
    ]),
  });
  add("V0-MUT-041", "read-v1-context", "V0 output depends only on the public local request", {
    "V0-LOCAL-001": operation("make the result depend on the ambient previous object", "requestOnlyDependency and previousIgnored are exactly true", [
      replace("V0-LOCAL-001", ["requestOnlyDependency"], false),
      replace("V0-LOCAL-001", ["previousIgnored"], false),
    ]),
    "V0-LOCAL-NEAR-001": operation("make the result depend on injected V1 previous context", "requestOnlyDependency and previousIgnored are exactly true", [
      replace("V0-LOCAL-NEAR-001", ["requestOnlyDependency"], false),
      replace("V0-LOCAL-NEAR-001", ["previousIgnored"], false),
    ]),
  });
  add("V0-MUT-042", "wall-time-cutoff", "deterministic work counters, never wall time, determine membership", {
    "V0-LOCAL-001": operation("make the result depend on the perturbed clock", "clockIgnored is exactly true", [
      replace("V0-LOCAL-001", ["clockIgnored"], false),
      replace("V0-LOCAL-001", ["requestOnlyDependency"], false),
    ]),
    "V0-LAW-001": operation("make law replay membership depend on the perturbed clock", "the law aggregate has no local clock field, so replace its exact fixture-bound projection with a failed replay counterfactual", [whole("V0-LAW-001", {
      caseId: "V0-LAW-001",
      lawId: "V0-LAW-DETERMINISTIC-REPLAY",
      semanticCounterfactual: "wall-time-cutoff",
      checks: [{ id: "replay-V0-CAND-001", accepted: false }],
    })]),
  });
  add("V0-MUT-043", "replace-register-weave-with-cyclic-rotation", "all selected-degree register assignments are traversed", {
    "V0-CAND-001": operation("replace the accepted register weave with the first cyclic rotation", "register traversal reaches raw ordinal six with displacement four", [
      replace("V0-CAND-001", ["registerTraversal", "rawGenerationOrdinal"], 0),
      replace("V0-CAND-001", ["registerTraversal", "templateOrderDisplacement"], 0),
    ]),
    "V0-WEAVE-NEAR-001": operation("permit the cyclic prefilter and replace the accepted weave ordinal", "cyclic prefilter is false at raw ordinal six", [
      replace("V0-WEAVE-NEAR-001", ["cyclicPrefilterPermitted"], true),
      replace("V0-WEAVE-NEAR-001", ["rawGenerationOrdinal"], 0),
    ]),
  });
  add("V0-MUT-044", "promote-realization-cardinality-to-template-minimum", "declared template minimum remains separate from realization fit", {
    "V0-CAND-033": operation("replace adaptive role omission with a template voice-count minimum", "required/guide omissions are the exact refusal facts", [
      replace("V0-CAND-033", ["primaryReason"], "voice-count-below-template-minimum"),
      replace("V0-CAND-033", ["reasons"], ["voice-count-below-template-minimum"]),
      replace("V0-CAND-033", ["omittedRequiredDegrees"], []),
      replace("V0-CAND-033", ["omittedGuideToneDegrees"], []),
    ]),
    "V0-ADAPTIVE-SLOTS-NEAR-001": operation("replace the first adaptive role omission with a template voice-count minimum", "first named case has exact required and guide omissions", [
      replace("V0-ADAPTIVE-SLOTS-NEAR-001", ["cases", 0, "reasons"], ["voice-count-below-template-minimum"]),
      replace("V0-ADAPTIVE-SLOTS-NEAR-001", ["cases", 0, "omittedRequiredDegrees"], []),
      replace("V0-ADAPTIVE-SLOTS-NEAR-001", ["cases", 0, "omittedGuideToneDegrees"], []),
      replace("V0-ADAPTIVE-SLOTS-NEAR-001", ["supportedAdaptiveCountsAvoidBelowMinimum"], false),
    ]),
  });

  const op14Constraints = expectedAt(
    "V0-OP-REFUSAL-014",
    ["refusal", "constraints"],
  );
  if (!Array.isArray(op14Constraints)) {
    throw new Error("V0-OP-REFUSAL-014 fixture constraints missing");
  }
  const constraintRows = op14Constraints as readonly V0CanonicalJson[];
  const constraintCode = (value: V0CanonicalJson): string => {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new Error("V0 constraint record expected");
    }
    const code: unknown = (
      value as Readonly<Record<string, unknown>>
    )["code"];
    if (typeof code !== "string") throw new Error("V0 constraint code expected");
    return code;
  };
  const codeSeen = new Set<string>();
  const codeOnlyConstraints = constraintRows.filter((constraint) => {
    const code = constraintCode(constraint);
    if (codeSeen.has(code)) return false;
    codeSeen.add(code);
    return true;
  });
  add("V0-MUT-045", "deduplicate-unsatisfied-observations-by-code-only", "constraint observations use their complete public payload identity", {
    "V0-OP-REFUSAL-014": operation("deduplicate the exact refusal observations by code alone", "nine exact full-payload constraints include repeated codes", [replace("V0-OP-REFUSAL-014", ["refusal", "constraints"], codeOnlyConstraints)]),
    "V0-OP-REFUSAL-016": operation("erase the distinct-observation overflow by collapsing observations to codes", "exact prospective-17 all-or-nothing work-limit refusal", [whole("V0-OP-REFUSAL-016", {
      caseId: "V0-OP-REFUSAL-016",
      ok: false,
      valuePresent: false,
      evidence: { termination: "constraints-unsatisfied", constraintObservationsProduced: 8 },
      refusal: { code: "voicing.constraints_unsatisfied", path: ["policy"], constraints: [] },
      semanticCounterfactual: "observations-deduplicated-by-code",
    })]),
  });
  const duplicateConstraint = clone(constraintRows[6] as V0CanonicalJson);
  add("V0-MUT-046", "count-exact-duplicate-as-distinct-observation", "an exact observation duplicate consumes no new record", {
    "V0-OP-REFUSAL-014": operation("insert the exact duplicate low-spacing observation into the owned population", "nine-row refusal has already collapsed the submitted duplicate", [insert(["refusal", "constraints"], 9, 7, duplicateConstraint)]),
  });
  add("V0-MUT-047", "truncate-no-result-constraint-observations", "distinct observation 17 returns an all-or-nothing work limit", {
    "V0-OP-REFUSAL-016": operation("truncate at sixteen observations and return a musical refusal", "exact prospective-17 work-limit refusal", [whole("V0-OP-REFUSAL-016", {
      caseId: "V0-OP-REFUSAL-016",
      ok: false,
      valuePresent: false,
      evidence: { termination: "constraints-unsatisfied", constraintObservationsProduced: 16 },
      refusal: { code: "voicing.constraints_unsatisfied", path: ["policy"], constraints: [] },
      semanticCounterfactual: "constraint-observations-truncated",
    })]),
    "V0-TRANS-018": operation("truncate the first root cell instead of returning its all-or-nothing work limit", "first root cell is the exact prospective-17 refusal", [replace("V0-TRANS-018", ["cells", 0], {
      rootId: "V0-ROOT-001",
      rootSymbol: "C",
      rootSpelling: { step: "C", alter: 0 },
      rootPitchClass: 0,
      ok: false,
      refusal: { code: "voicing.constraints_unsatisfied", path: ["policy"], constraints: [] },
      evidence: {
        constraintObservationComparisons: 163,
        constraintObservationsProduced: 16,
        peakConstraintObservationRecords: 16,
        peakTrackedRecords: 161,
        termination: "constraints-unsatisfied",
      },
      requestRootObserved: true,
      forwardRefusalProjectionAccepted: false,
      inverseApplicability: "not-applicable-no-generated-candidate",
      semanticCounterfactual: "constraint-observations-truncated",
    })]),
  });
  const provisionalOverflowRefusal = (caseId: string): V0CanonicalJson => ({
    caseId,
    ok: false,
    valuePresent: false,
    evidence: { termination: "work-limit-exceeded", constraintObservationsProduced: 16 },
    refusal: {
      code: "limit.voicing_work_exceeded",
      path: [],
      counter: "constraintObservationsProduced",
      received: 17,
      maximum: 16,
      partialResult: false,
    },
    semanticCounterfactual: "provisional-overflow-made-terminal",
  });
  add("V0-MUT-048", "make-provisional-observation-overflow-terminal", "a later legal candidate clears provisional observation overflow", {
    "V0-CONSTRAINT-OVERFLOW-NEAR-001": operation("terminate at the provisional observation overflow", "named projection records the later hard-valid candidate and cleared provisional overflow", [
      replace("V0-CONSTRAINT-OVERFLOW-NEAR-001", ["candidateMidiValues"], []),
      replace("V0-CONSTRAINT-OVERFLOW-NEAR-001", ["laterHardValidCandidateFound"], false),
      replace("V0-CONSTRAINT-OVERFLOW-NEAR-001", ["provisionalOverflowCleared"], false),
      replace("V0-CONSTRAINT-OVERFLOW-NEAR-001", ["refusalPresent"], true),
      replace("V0-CONSTRAINT-OVERFLOW-NEAR-001", ["termination"], "work-limit-exceeded"),
    ]),
    "V0-OP-SUCCESS-004": operation("terminate before the later legal candidate clears provisional overflow", "operation completes with one legal generated candidate", [whole("V0-OP-SUCCESS-004", provisionalOverflowRefusal("V0-OP-SUCCESS-004"))]),
  });
  const reasonSeen = new Set<string>();
  const reasonBlindConstraints = constraintRows.filter((constraint) => {
    if (constraint === null || Array.isArray(constraint) || typeof constraint !== "object") {
      throw new Error("V0 constraint record expected");
    }
    const copy = Object.fromEntries(
      Object.entries(constraint).filter(([key]) => key !== "reason"),
    ) as Record<string, V0CanonicalJson>;
    const identity = stable(copy);
    if (reasonSeen.has(identity)) return false;
    reasonSeen.add(identity);
    return true;
  });
  add("V0-MUT-049", "ignore-reason-in-observation-identity-and-order", "observation identity and ordering include frozen reason precedence", {
    "V0-OP-REFUSAL-014": operation("collapse the reason-only-distinct family observation", "exact refusal contains two otherwise-equal family observations ordered by reason", [replace("V0-OP-REFUSAL-014", ["refusal", "constraints"], reasonBlindConstraints)]),
  });
  add("V0-MUT-050", "apply-drop2-wide-gap-floor-to-dense-counts", "the Drop-2 wide-gap floor applies only to counts four and five", {
    "V0-CAND-034": operation("reject the legal dense six-voice Drop-2 candidate with a wide-gap floor", "exact generated six-voice dense candidate", [whole("V0-CAND-034", {
      caseId: "V0-CAND-034",
      ok: false,
      code: "voicing.constraints_unsatisfied",
      primaryReason: "drop2-wide-gap-floor",
      termination: "constraints-unsatisfied",
      semanticCounterfactual: "wide-gap-floor-applied-to-six-voices",
    })]),
    "V0-CAND-035": operation("reject the legal dense seven-voice Drop-2 candidate with a wide-gap floor", "exact generated seven-voice dense candidate", [whole("V0-CAND-035", {
      caseId: "V0-CAND-035",
      ok: false,
      code: "voicing.constraints_unsatisfied",
      primaryReason: "drop2-wide-gap-floor",
      termination: "constraints-unsatisfied",
      semanticCounterfactual: "wide-gap-floor-applied-to-seven-voices",
    })]),
  });
  add("V0-MUT-051", "assume-drop2-static-feasibility-from-degree-count", "Drop-2 static feasibility proves a legal unique closed-source inversion", {
    "V0-CAND-036": operation("accept the structurally impossible Drop-2 request from degree count alone", "exact family-transform-invalid refusal", [whole("V0-CAND-036", generatedFault("V0-CAND-036", "drop2-feasible-by-degree-count-only", {
      requestedFamily: "drop2",
      realizedFamily: "drop2",
    }))]),
    "V0-CAND-037": operation("accept the duplicate-degree Drop-2 request from degree count alone", "exact family-transform-invalid refusal", [whole("V0-CAND-037", generatedFault("V0-CAND-037", "drop2-feasible-by-degree-count-only", {
      requestedFamily: "drop2",
      realizedFamily: "drop2",
    }))]),
  });

  return Object.freeze(definitions);
}
