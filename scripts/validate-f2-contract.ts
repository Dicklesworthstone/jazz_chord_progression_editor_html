import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type F2ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type F2ContractValidationReport = Readonly<{
  schema: "changes.validation.f2-contract.v1";
  package: "F2";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    shapeCases: number;
    adversarialCases: number;
    totalCases: number;
    traces: number;
    authorities: number;
    seeds: number;
    mutationControls: number;
    objectSchemas: number;
  }>;
  findings: readonly F2ContractFinding[];
}>;

type ParsedJson = Readonly<{
  filename: string;
  source: string;
  root: JsonObject;
  digest: string;
}>;

type FixtureCase = Readonly<{
  id: string;
  path: string;
  traceIds: readonly string[];
  authorityIds: readonly string[];
  record: JsonObject;
}>;

const EXPECTED_COMPANIONS = [
  ["adversarial-cases.json", "changes.fixtures.f2-adversarial-cases.v1"],
  ["provenance-ledger.json", "changes.fixtures.f2-provenance-ledger.v1"],
  ["shape-cases.json", "changes.fixtures.f2-shape-cases.v1"],
  ["trace-ledger.json", "changes.fixtures.f2-trace-ledger.v1"],
] as const;

const EXPECTED_COMPANION_DECLARATIONS = [
  {
    path: "shape-cases.json",
    schema: "changes.fixtures.f2-shape-cases.v1",
    recordCollections: ["cases"],
  },
  {
    path: "adversarial-cases.json",
    schema: "changes.fixtures.f2-adversarial-cases.v1",
    recordCollections: ["cases"],
  },
  {
    path: "trace-ledger.json",
    schema: "changes.fixtures.f2-trace-ledger.v1",
    recordCollections: ["traces"],
  },
  {
    path: "provenance-ledger.json",
    schema: "changes.fixtures.f2-provenance-ledger.v1",
    recordCollections: ["authorities"],
  },
] as const;

const EXPECTED_LIMITS = {
  maxUtf8ImportBytes: 2_097_152,
  maxJsonDepth: 32,
  rootContainerDepth: 1,
  maxSections: 64,
  maxMeasuresPerSection: 1_024,
  maxEventsPerDocument: 8_192,
  maxStableIdAsciiCharacters: 128,
  maxShortTextCodePoints: 256,
  maxLongTextCodePoints: 2_000,
  maxEngineVersionCodePoints: 64,
  maxVoicingPitches: 16,
  maxBeatNumerator: 2_147_483_647,
  midiPpq: 960,
  maxTimelineQuarterNoteBeats: 1_000_000,
  minimumTempoBpm: 20,
  maximumTempoBpm: 400,
  minimumBeatsPerBar: 1,
  maximumBeatsPerBar: 32,
  minimumMidi: 0,
  maximumMidi: 127,
  minimumPlaybackLevel: 0,
  maximumPlaybackLevel: 1,
} as const;

const EXPECTED_PUBLIC_SURFACE = {
  contractSchema: "changes.domain.document-decoder-contract.v1",
  operations: [
    {
      name: "preflightDocumentImportBytes",
      input: "number observed from the original UTF-8 payload",
      success:
        "DecodeResult<{utf8ByteLength:number}, shape.invalid_type|limit.import_bytes_exceeded>",
      doesNotOwn: ["UTF-8 decoding", "JSON parsing", "shape decoding"],
    },
    {
      name: "decodeDocumentShape",
      input: "unknown already-materialized value",
      success:
        "DecodeResult<ProgressionDocumentShapeV2,DocumentShapeIssueCode>",
      doesNotOwn: [
        "original byte measurement",
        "theory semantics",
        "ValidatedDocument cast",
      ],
    },
  ],
  operationOrder: [
    "preflightDocumentImportBytes",
    "decodeDocumentShape",
  ],
  operationsValue: {
    name: "documentDecodeOperations",
    ownKeysInOrder: [
      "preflightDocumentImportBytes",
      "decodeDocumentShape",
    ],
    membersEqualNamedFunctionExports: true,
    recursivelyFrozen: true,
    reexportedFromDomainIndex: true,
  },
  successWarnings: [],
  failureHasPartialValue: false,
} as const;

const EXPECTED_INTERNAL_EVIDENCE_SURFACE = {
  module: "src/domain/document-decoder.ts",
  seams: [
    "preflightDocumentImportBytesWithEvidence",
    "decodeDocumentShapeWithEvidence",
  ],
  resultOwnKeysInOrder: ["result", "evidence"],
  decoderEvidenceCounterCount: 28,
  harnessObservationCounterCount: 7,
  publicIndexExported: false,
  hiddenMutableState: false,
} as const;

const EXPECTED_AUTHORITY_POLICY = {
  expectedValuesGeneratedByProduction: false,
  productionModulesImported: false,
  productionArtifactUsedAsAuthority: false,
  authoringMethod:
    "manual review of the frozen domain wire contract, explicit boundary arithmetic, and adversarial ECMAScript descriptors",
  forbiddenShortcuts: [
    "Do not generate expected diagnostics with the decoder under test.",
    "Do not property-read, spread, iterate, revive, stringify, normalize, or repair untrusted shape data.",
    "Do not treat structural success as ValidatedDocument publication.",
    "Do not move source-text, formula, custom-correspondence, or measure-completion semantics into F2.",
    "Do not use wall time as a correctness or musical cutoff.",
  ],
} as const;

const EXPECTED_STAGE_OWNERSHIP = {
  importAdapter:
    "fatal UTF-8 decode and JSON.parse without a reviver after the F2 byte preflight",
  F2:
    "own-field shape, values, limits, canonical wire time, chord/voicing structural compatibility, global ID uniqueness, freshness, and immutable temporary candidate",
  T1F3:
    "source/AST/formula agreement, custom pitch/voicing correspondence, completion semantics, playback realizability, promotion, and sole publication cast",
  A0:
    "revision-aware atomic publication, cancellation, stale results, selection, and history",
} as const;

const EXPECTED_DIAGNOSTICS = {
  stableFields: ["code", "path"],
  requiredNonstableFields: ["message"],
  issueOwnKeysLexical: ["code", "message", "path"],
  forbiddenIssueKeys: ["sourceText", "suggestion"],
  successKeys: ["ok", "value", "warnings"],
  failureKeys: ["errors", "ok"],
  ordering: ["path", "code"],
  numericPathSegments: "numeric ascending",
  stringPathSegments: "ECMAScript code-unit lexical ascending",
  equalPrefix: "shorter first",
  duplicateCodePathPairs: "collapse",
  diagnosticCap: "none beyond the supported-path 2 MiB input bound",
} as const;

const EXPECTED_TERMINATION = {
  correctnessClock: "deterministic counters only",
  externalResourceBoundary: "preflighted payload at most 2 MiB",
  shapeDecoderScope: "terminating ECMAScript reflection operations",
  explicitExclusion: "a Proxy trap that never returns",
  candidateAllocation:
    "none proportional to an oversized declared collection before its limit check",
} as const;

const EXPECTED_REVIEWED_DIGESTS = {
  contractDocumentSha256:
    "1d489d5fee8dc9ef060391ce01cd3bdd1826ce761a4e38ba3fc5423c5c8b8bc8",
  companionsSha256: {
    "adversarial-cases.json":
      "a6a8573e53b11e044e22a267d82ddf57f930913f966d157ed4e4e0d96ded5243",
    "provenance-ledger.json":
      "e9a24fdb862292cc774e5866c704160d33110f270aa43fe058cc55d390daef99",
    "shape-cases.json":
      "6fe69ec31d7136af24e02438a358ba2092378a62b1c7bd4ff6a268acc2a446bc",
    "trace-ledger.json":
      "664427ba257c0a6efcad69d926b472def777d20326c24cf22f62dd79c90ad6cd",
  },
} as const;

/**
 * Validator-owned semantic locks. Unlike the authoring manifest's byte pins,
 * these cannot be updated by coherently weakening a fixture and its own
 * reviewedDigests declaration. JSON locks use recursively sorted object keys
 * while preserving every array's reviewed order; the manifest projection
 * deliberately omits only its self-referential reviewedDigests field.
 */
const EXPECTED_SEMANTIC_SNAPSHOT_DIGESTS = {
  json: {
    "f2-decoder-contract.json":
      "7778f4ad4bdadfeb2e736a4925f840f357f68f40d6e4e036c69cf851c7a94bb1",
    "adversarial-cases.json":
      "4a321bf2437b7a4ee37861f7dd387ab50b3d2b11bc51e553ed791752047f2f69",
    "provenance-ledger.json":
      "45eabc724d9d0a4e9ca2fab5bc1189c1eb042b0b1272fcdf6f3b37d88a9ffef1",
    "shape-cases.json":
      "0d0fe2a30bcf3a23be858943938615ad0a3b59ecb1a6864a1861cd3802d6a14d",
    "trace-ledger.json":
      "bf61e11d067bbcf466fa8e9a376dbf23007f1eb7f28705010679ac0760100199",
  },
  contractDocumentNormalizedSha256:
    "1d489d5fee8dc9ef060391ce01cd3bdd1826ce761a4e38ba3fc5423c5c8b8bc8",
} as const;

const EXPECTED_MATERIALIZATION_PROTOCOL_SHA256 =
  "65bbd4d9b381c411fe30996859455de0ad66726f082cdfc9631572e99a4d924a";
const EXPECTED_SEEDED_REPLAY_PROTOCOL_SHA256 =
  "28a90d57cf20664ae699e3bc5db792847627cfdbd41912beccf7fbf83c519e40";
const EXPECTED_COUNTER_SEMANTICS_SHA256 =
  "f8e9cb38730af20fb644a58419fb18afd45e837ba0e1a1ba19ca8dfce913c51d";
const EXPECTED_TRACE_PROOF_CLASSIFICATION_SHA256 =
  "3a25bc570804871008800f5a0c27b4f0b6742f2df00c051f335b54407205b5c5";
const EXPECTED_MUTATION_LEDGER_SHA256 =
  "a564e4a7f7225b0959b770b41fdd622aa2b3c39698b42673aee089e1e2fdbae7";
const EXPECTED_TARGET_REGISTRIES_SHA256 =
  "9ff7fcc1179879a068eeec9a069b65c79c1ef6fe972077fd380adaaf3db64afd";
const EXPECTED_CRITICAL_CELL_INVENTORIES_SHA256 =
  "ef414a546e00921182d60174aa9cb3ba309d8f9002afa865a93d6a176a09121f";
const EXPECTED_WORK_EVIDENCE_CONTRACT_SHA256 =
  "ef4ca43432eaca00231d4cc53e63fff727e933361c8cf910e9fc2ac331c915c9";

const EXPECTED_CUSTOM_BASS_AXIS_TARGET = {
  id: "custom-bass",
  activation: "customSlashBass",
  path: [
    "sections",
    0,
    "measures",
    0,
    "events",
    0,
    "chord",
    "bass",
  ],
  acceptedAxisCompanion: {
    appliesTo:
      "invalidPitchClassConsumerTargets x acceptedPitchAxes values only",
    path: [
      "sections",
      0,
      "measures",
      0,
      "events",
      0,
      "voicing",
      "pitches",
      0,
    ],
    valueRule:
      "after setting the Custom bass axis, replace Manual pitches[0] with the exact resulting {step,alter,octave:3}; octave 3 keeps every accepted spelling at the minimum while isolating the bass leaf law",
  },
} as const;

const EXPECTED_INVENTORIES = {
  documentSchema: ["changes.progression.v2"],
  stableIdPattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
  steps: ["C", "D", "E", "F", "G", "A", "B"],
  alterations: [-2, -1, 0, 1, 2],
  beatDenominators: [
    1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 32, 40, 48,
    60, 64, 80, 96, 120, 160, 192, 240, 320, 480, 960,
  ],
  beatUnits: [2, 4, 8],
  keyModes: ["major", "natural-minor", "harmonic-minor", "melodic-minor"],
  instrumentIds: [
    "mellow-keys",
    "fm-electric-piano",
    "vibraphone",
    "warm-pad",
    "analog-poly",
    "concert-grand",
    "flute",
    "organ",
    "guitar",
  ],
  completionKinds: ["empty", "complete", "pickup", "incomplete"],
  voiceLeadingBoundaries: ["continue", "reset"],
  chordKinds: ["parsed", "custom"],
  triadQualities: [
    "major",
    "minor",
    "diminished",
    "augmented",
    "sus2",
    "sus4",
    "power",
  ],
  seventhQualities: ["major", "minor", "diminished"],
  colorPolicies: ["none", "altered-dominant"],
  degreeNumbers: [1, 2, 3, 4, 5, 6, 7, 9, 11, 13],
  autoFamilies: [
    "balanced",
    "shell",
    "rootless-a",
    "rootless-b",
    "open",
    "drop2",
    "quartal",
  ],
  autoVoiceCounts: [3, 4, 5, 6, 7],
  autoBassPolicies: ["generated", "external", "none"],
  storedBassPolicies: ["included", "external"],
  voicingModes: ["auto", "manual", "frozen"],
  countInBars: [0, 1, 2],
} as const;

const EXPECTED_OBJECT_SCHEMA_FIELDS = new Map<string, readonly string[]>([
  ["auto-voicing", ["bassPolicy", "family", "mode", "range", "voiceCount"]],
  ["beat-value", ["denominator", "numerator"]],
  ["chord-degree", ["alter", "number"]],
  ["completion-complete", ["kind"]],
  ["completion-empty", ["kind"]],
  ["completion-partial", ["expectedDuration", "kind", "reason"]],
  ["custom-chord", ["bass", "kind", "label", "pitchNames", "sourceText"]],
  ["document", ["description", "id", "key", "meter", "playback", "schema", "sections", "tempoBpm", "title"]],
  ["event", ["annotation", "chord", "duration", "id", "voicing"]],
  ["frozen-provenance", ["engineVersion", "family"]],
  ["frozen-voicing", ["bassPolicy", "generatedBy", "mode", "pitches"]],
  ["key-context", ["mode", "tonic"]],
  ["manual-voicing", ["bassPolicy", "mode", "pitches"]],
  ["measure", ["completion", "events", "id"]],
  ["meter", ["beatUnit", "beatsPerBar"]],
  ["midi-range", ["highMidi", "lowMidi"]],
  ["parsed-chord", ["additions", "alterations", "bass", "colorPolicy", "extensions", "kind", "omissions", "root", "seventh", "sixth", "sourceText", "triad"]],
  ["playback", ["countInBars", "instrumentId", "masterVolume", "reverbAmount"]],
  ["section", ["annotation", "id", "keyOverride", "measures", "name", "voiceLeadingBoundary"]],
  ["spelled-pitch", ["alter", "octave", "step"]],
  ["spelled-pitch-class", ["alter", "step"]],
]);

/**
 * jcpe-jnnu amendment: the single optional persisted property in v2. Every
 * other record keeps the frozen no-optional-fields law; a second entry here
 * requires its own recorded contract amendment.
 */
const EXPECTED_OBJECT_SCHEMA_OPTIONAL_FIELDS = new Map<
  string,
  readonly string[]
>([["playback", ["grooveStyleId"]]]);

const EXPECTED_OBJECT_SCHEMA_DISCRIMINATORS = new Map<
  string,
  Readonly<{ field: string; values: readonly string[] }>
>([
  ["auto-voicing", { field: "mode", values: ["auto"] }],
  ["completion-complete", { field: "kind", values: ["complete"] }],
  ["completion-empty", { field: "kind", values: ["empty"] }],
  ["completion-partial", { field: "kind", values: ["incomplete", "pickup"] }],
  ["custom-chord", { field: "kind", values: ["custom"] }],
  ["frozen-voicing", { field: "mode", values: ["frozen"] }],
  ["manual-voicing", { field: "mode", values: ["manual"] }],
  ["parsed-chord", { field: "kind", values: ["parsed"] }],
]);

const EXPECTED_TRACE_IDS = [
  "F2-TRACE-API",
  "F2-TRACE-BOUNDS",
  "F2-TRACE-CHORD-VOICING",
  "F2-TRACE-DIAGNOSTICS",
  "F2-TRACE-FRESHNESS",
  "F2-TRACE-IDS",
  "F2-TRACE-LIMITS",
  "F2-TRACE-STAGE-OWNERSHIP",
  "F2-TRACE-STRICT-SHAPE",
  "F2-TRACE-TEXT",
  "F2-TRACE-TIME",
  "F2-TRACE-TOTALITY",
] as const;

const EXPECTED_AUTHORITY_IDS = [
  "F2-AUTH-ECMASCRIPT-DATA",
  "F2-AUTH-F1-VALUES",
  "F2-AUTH-PROJECT-SCHEMA",
  "F2-AUTH-SECURITY-BOUNDARY",
  "F2-AUTH-STAGE-OWNERSHIP",
] as const;

const EXPECTED_SEEDS = new Map<string, number>([
  ["F2-SEED-BOUNDS", 4_071_718_401],
  ["F2-SEED-CHORD", 4_072_934_661],
  ["F2-SEED-HOSTILE", 4_070_713_863],
  ["F2-SEED-IDS", 4_062_007_300],
  ["F2-SEED-ORDER", 4_060_995_080],
  ["F2-SEED-SHAPE", 4_066_024_962],
  ["F2-SEED-TIME", 4_067_536_390],
  ["F2-SEED-UNICODE", 4_072_726_019],
]);

const EXPECTED_BRANCH_FRAGMENT_IDS = [
  "documentKey",
  "customChord",
  "manualVoicing",
  "frozenVoicing",
  "emptyCompletion",
  "partialCompletion",
  "pickupCompletion",
] as const;

const EXPECTED_EXECUTABLE_ACTIVATION_IDS = [
  "manualVoicing",
  "frozenVoicing",
  "customChord",
  "customChord-plus-manualVoicing",
  "emptyCompletion",
  "partialCompletion",
  "pickupCompletion",
  "sectionKeyOverride",
  "parsedSlashBass",
  "customSlashBass",
  "parsedDegree",
  "parsedAdditionDegree",
  "parsedAlterationDegree",
  "parsedOmission",
  "parsedSixth",
] as const;

const EXPECTED_ACTIVATION_PROTOCOL_KEYS = [
  ...EXPECTED_EXECUTABLE_ACTIVATION_IDS,
  "parsed-or-custom",
  "slashBass",
  "activationsArray",
] as const;

const REQUIRED_MATERIALIZATION_PROTOCOL_KEYS = [
  "path",
  "set",
  "setFragment",
  "delete",
  "add",
  "bareCellMutation",
  "directInputExpansion",
  "repeatAscii",
  "repeatCodePoint",
  "repeatLiteralArray",
  "specialString",
  "specialValue",
  "specialPrimitive",
  "stringSegments",
  "specialNumber",
  "registeredTargetCell",
  "consumerCoDiagnosticCell",
  "negativeZeroAxisCell",
  "counterpartExpansion",
  "expectedDurationExpansion",
  "matrix",
  "ordinaryArrayExpansion",
  "mutationExpansion",
  "caseExpansionPrecedence",
  "explicitCartesianOnly",
  "caseObservationOrder",
  "successfulShapeRoundTrip",
  "productionOracleForbidden",
] as const;

const EXPECTED_SCHEMA_FIELD_TYPES = new Set([
  "array",
  "nullableRecord",
  "nullableString",
  "number",
  "record",
  "string",
]);

const EXPECTED_SEEDED_REPLAY_KEYS = [
  "prng",
  "transition",
  "selection",
  "excludedCaseIds",
  "expectationPolicy",
  "caseMaterialization",
  "replay",
  "caseObservation",
  "canonicalJson",
  "caseLine",
  "seedDigests",
  "cellIndexForbidden",
] as const;

const EXPECTED_STATIC_OBLIGATIONS = {
  decoderModule: "src/domain/document-decoder.ts",
  publicRuntimeExports: [
    "preflightDocumentImportBytes",
    "decodeDocumentShape",
    "documentDecodeOperations",
  ],
  operationsValue: "documentDecodeOperations",
  operationsOwnKeysInOrder: [
    "preflightDocumentImportBytes",
    "decodeDocumentShape",
  ],
  operationsMembersEqualNamedFunctionExports: true,
  operationsValueRecursivelyFrozen: true,
  operationsAndNamedFunctionsReexportedFromDomainIndex: true,
  evidenceSeams: [
    {
      name: "preflightDocumentImportBytesWithEvidence",
      signature:
        "(utf8ByteLength:number)=>DocumentImportBytePreflightWithEvidenceResult",
    },
    {
      name: "decodeDocumentShapeWithEvidence",
      signature: "(input:unknown)=>DocumentShapeDecodeWithEvidenceResult",
    },
  ],
  evidenceSeamsPublic: false,
  evidenceResultOwnKeysInOrder: ["result", "evidence"],
  evidenceResultsRecursivelyFrozen: true,
  evidenceHasNoHiddenMutableState: true,
  decoderEvidenceKeys: [
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
  ],
  harnessObservationKeys: [
    "getterCallbacks",
    "propertyGetCallbacks",
    "prototypeCallbacks",
    "iteratorCallbacks",
    "toJSONCallbacks",
    "sourceMutations",
    "stateWrites",
  ],
  forbiddenPublicExports: [
    "preflightDocumentImportBytesWithEvidence",
    "decodeDocumentShapeWithEvidence",
    "DocumentDecoderEvidence",
    "DocumentImportBytePreflightWithEvidenceResult",
    "DocumentShapeDecodeWithEvidenceResult",
    "PreflightDocumentImportBytesWithEvidence",
    "DecodeDocumentShapeWithEvidence",
  ],
  moduleRetentionStaticPolicy: {
    moduleScopeLetOrVarCount: 0,
    unfrozenModuleScopeReferenceBindings: 0,
    writesToFunctionImportOrModuleBindings: 0,
    mutableBuiltInModuleConstants: 0,
    allowedReferenceBindings:
      "only named function declarations with no writes, recursively frozen acyclic plain literal record/array lookup constants, and recursively frozen documentDecodeOperations",
    forbiddenNestedConstantKinds: [
      "Map",
      "Set",
      "WeakMap",
      "WeakSet",
      "typed array",
      "Date",
      "RegExp",
      "class instance",
      "function",
      "accessor",
    ],
  },
  untrustedInputStaticPolicy: {
    singleReviewedReflectionSnapshotRoutine: true,
    directContainerReadsOutsideSnapshot: 0,
    inputSuppliedHelperOrIterationCalls: 0,
    taintedContainerWrites: 0,
    runtimeFullGraphWriteTrapCallbacks: 0,
  },
  candidateConstructionStaticPolicy: {
    localCounterIncrementingFactoriesRequired: [
      "allocateCandidateObject",
      "allocateCandidateArray",
    ],
    candidateContainersCreatedOutsideFactories: 0,
    f1ReturnedContainersAttachedToCandidateGraph: 0,
    forbiddenCompositeConstructorCalls: ["makeChordEvent"],
  },
  publicPrivateParityStaticPolicy: {
    oneSharedCore: true,
    publicWrapperSemanticBranches: 0,
    publicResultEqualsPrivateResultForEveryMaterializedCell: true,
  },
  iterativeDepthStaticPolicy: {
    explicitLocalWorklistLoopRequired: true,
    depthPreflightCallGraphCycleCount: 0,
    recursiveDepthTraversalForbidden: true,
  },
  forbiddenAstPatterns: [
    "Object.assign call",
    "JSON.stringify call",
    "untrusted SpreadElement",
    "untrusted container MemberExpression or destructuring read outside snapshot",
    "untrusted Reflect.get or input-supplied helper call",
    "untrusted assignment, update, delete, define, set, setPrototypeOf, or mutating method call",
    "candidate object or array construction outside the reviewed counter-incrementing factories",
    "F1-returned container attached to the candidate graph",
    "makeChordEvent call",
    "Date.now, performance.now, Temporal.Now, setTimeout, setInterval, or timer API",
    "any assertion or unchecked assertion helper in candidate flow",
    "module-scope let or var",
    "unfrozen module-scope reference binding",
    "mutable built-in nested in a module constant",
    "write to a function, function property, import, or module binding",
    "recursive depth-preflight call-graph cycle",
  ],
  forbiddenImports: [
    "application",
    "theory",
    "content",
    "ui",
    "audio",
    "persistence",
    "export",
    "tests",
    "test-support",
  ],
  forbiddenSyntax: [
    "as ValidatedDocument",
    "satisfies ValidatedDocument",
    "ValidatedDocument constructor",
    "ValidatedDocument assertion function",
    "as ProgressionDocumentShapeV2",
    "as unknown as ProgressionDocumentShapeV2",
    "ProgressionDocumentShapeV2 assertion function",
    "as any in decoded candidate flow",
    "any or unknown assertion helper that returns a decoded candidate type",
  ],
  successType: "ProgressionDocumentShapeV2",
  soleCastOwner: "src/application/document-validation.ts",
  sourcePolicyFindings: 0,
} as const;

const EXPECTED_MUTATION_SUMMARY = {
  definedControls: 244,
  f2OwnedControls: 242,
  e0OwnedControls: 2,
  everyControlMapsToCaseIds: true,
  futureGate:
    "F2/build kills all 242 F2 controls; E0 integration later kills the 2 E0 controls",
  specDoesNotClaimControlsAlreadyExecuted: true,
} as const;

const EXPECTED_EVIDENCE_COUNTERS = [
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
  "getterCallbacks",
  "propertyGetCallbacks",
  "prototypeCallbacks",
  "iteratorCallbacks",
  "toJSONCallbacks",
  "sourceMutations",
  "stateWrites",
] as const;

const EXPECTED_DECODER_EVIDENCE_COUNTERS =
  EXPECTED_EVIDENCE_COUNTERS.slice(0, 28);
const EXPECTED_HARNESS_OBSERVATION_COUNTERS =
  EXPECTED_EVIDENCE_COUNTERS.slice(28);

/** Independently reviewed F1/F2 issue vocabulary; production is not imported. */
export const F2_REVIEWED_DOCUMENT_SHAPE_ISSUE_CODES = [
  "shape.unknown_field",
  "shape.invalid_type",
  "document.root_not_object",
  "document.schema_invalid",
  "document.schema_missing",
  "limit.json_depth_exceeded",
  "limit.sections_exceeded",
  "limit.measures_per_section_exceeded",
  "limit.events_per_document_exceeded",
  "id.syntax_invalid",
  "id.length_exceeded",
  "id.duplicate",
  "string.blank",
  "limit.symbol_code_points_exceeded",
  "limit.annotation_code_points_exceeded",
  "limit.title_code_points_exceeded",
  "limit.section_name_code_points_exceeded",
  "limit.custom_label_code_points_exceeded",
  "limit.description_code_points_exceeded",
  "limit.reason_code_points_exceeded",
  "limit.engine_version_code_points_exceeded",
  "string.invalid_unicode_scalar",
  "pitch.step_invalid",
  "pitch.alter_out_of_range",
  "pitch.octave_not_integer",
  "pitch.octave_not_safe_integer",
  "pitch.midi_not_integer",
  "pitch.midi_out_of_range",
  "key.mode_invalid",
  "document.instrument_id_invalid",
  "chord.degree_number_invalid",
  "chord.degree_alter_out_of_range",
  "chord.degree_order",
  "chord.degree_duplicate",
  "custom.pitch_names_empty",
  "custom.auto_voicing_forbidden",
  "voicing.pitches_empty",
  "limit.voicing_notes_exceeded",
  "voicing.range_reversed",
  "voicing.voice_count_invalid",
  "voicing.rootless_requires_external",
  "voicing.slash_bass_policy_none",
  "voicing.external_without_slash_bass",
  "voicing.included_bass_not_lowest",
  "voicing.included_bass_spelling_mismatch",
  "voicing.external_bass_included",
  "voicing.engine_version_invalid",
  "beat.numerator_not_safe_integer",
  "beat.numerator_negative",
  "beat.numerator_out_of_range",
  "beat.denominator_not_safe_integer",
  "beat.denominator_not_positive",
  "beat.denominator_not_ppq_divisor",
  "beat.not_normalized",
  "beat.duration_not_positive",
  "timeline.total_exceeded",
  "meter.beats_per_bar_out_of_range",
  "meter.beat_unit_invalid",
  "tempo.not_finite",
  "tempo.not_integer",
  "tempo.out_of_range",
  "playback.level_not_finite",
  "playback.level_out_of_range",
  "playback.count_in_bars_invalid",
  "section.voice_leading_boundary_invalid",
  "playback.groove_style_invalid",
  "playback.groove_style_not_canonical",
] as const;

const ALLOWED_EXPECTED_ISSUE_CODES = new Set<string>([
  ...F2_REVIEWED_DOCUMENT_SHAPE_ISSUE_CODES,
  "limit.import_bytes_exceeded",
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalSemanticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => canonicalSemanticValue(item));
  }
  if (!isObject(value)) return value;
  const result: JsonObject = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalSemanticValue(value[key]);
  }
  return result;
}

function semanticSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalSemanticValue(value)))
    .digest("hex");
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function uniqueStrings(value: unknown): readonly string[] {
  const values = strings(value);
  return new Set(values).size === values.length ? values : [];
}

function finding(
  findings: F2ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

type FixturePath = readonly (string | number)[];

function fixturePath(value: unknown): value is FixturePath {
  return Array.isArray(value) && value.every(
    (segment: unknown) =>
      typeof segment === "string" ||
      (typeof segment === "number" &&
        Number.isSafeInteger(segment) &&
        segment >= 0),
  );
}

function cloneFixtureValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneFixtureValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      cloneFixtureValue(child),
    ]),
  );
}

function ownValueAtPath(
  root: unknown,
  path: FixturePath,
): Readonly<{ exists: boolean; value?: unknown }> {
  let cursor = root;
  for (const segment of path) {
    if (Array.isArray(cursor)) {
      if (
        typeof segment !== "number" ||
        !Object.prototype.hasOwnProperty.call(cursor, segment)
      ) {
        return { exists: false };
      }
      cursor = cursor[segment];
    } else if (isObject(cursor)) {
      if (
        typeof segment !== "string" ||
        !Object.prototype.hasOwnProperty.call(cursor, segment)
      ) {
        return { exists: false };
      }
      cursor = cursor[segment];
    } else {
      return { exists: false };
    }
  }
  return { exists: true, value: cursor };
}

function replaceOwnValueAtPath(
  root: unknown,
  path: FixturePath,
  value: unknown,
): boolean {
  if (path.length === 0) return false;
  const parent = ownValueAtPath(root, path.slice(0, -1));
  if (!parent.exists) return false;
  const final = path[path.length - 1];
  if (Array.isArray(parent.value) && typeof final === "number") {
    if (!Object.prototype.hasOwnProperty.call(parent.value, final)) return false;
    parent.value[final] = cloneFixtureValue(value);
    return true;
  }
  if (isObject(parent.value) && typeof final === "string") {
    if (!Object.prototype.hasOwnProperty.call(parent.value, final)) return false;
    parent.value[final] = cloneFixtureValue(value);
    return true;
  }
  return false;
}

function activationNamesFromRecord(value: JsonObject): readonly string[] {
  const result: string[] = [];
  if (typeof value["activation"] === "string") {
    result.push(value["activation"]);
  }
  if (Array.isArray(value["activations"])) {
    for (const activation of value["activations"]) {
      if (typeof activation === "string") result.push(activation);
    }
  }
  for (const key of ["chordActivation", "voicingActivation"] as const) {
    if (typeof value[key] === "string") result.push(value[key]);
  }
  return result;
}

function applyActivation(
  document: unknown,
  activationId: string,
  activationProtocol: JsonObject,
  branchFragments: JsonObject,
): boolean {
  const operations = activationProtocol[activationId];
  if (!Array.isArray(operations)) return false;
  for (const operation of operations) {
    if (!isObject(operation) || !fixturePath(operation["path"])) return false;
    if (operation["operation"] === "setFragment") {
      const fragmentId = operation["fragment"];
      if (
        typeof fragmentId !== "string" ||
        !Object.prototype.hasOwnProperty.call(branchFragments, fragmentId) ||
        !replaceOwnValueAtPath(
          document,
          operation["path"],
          branchFragments[fragmentId],
        )
      ) {
        return false;
      }
    } else if (
      operation["operation"] !== "set" ||
      !Object.prototype.hasOwnProperty.call(operation, "value") ||
      !replaceOwnValueAtPath(document, operation["path"], operation["value"])
    ) {
      return false;
    }
  }
  return true;
}

function activatedRepresentative(
  representative: unknown,
  activationIds: readonly string[],
  activationProtocol: JsonObject,
  branchFragments: JsonObject,
): JsonObject | undefined {
  const document = cloneFixtureValue(representative);
  if (!isObject(document)) return undefined;
  for (const activationId of activationIds) {
    if (
      !applyActivation(
        document,
        activationId,
        activationProtocol,
        branchFragments,
      )
    ) {
      return undefined;
    }
  }
  return document;
}

function scanDuplicateJsonKeys(
  source: string,
  filename: string,
  findings: F2ContractFinding[],
): void {
  let cursor = 0;

  function skipWhitespace(): void {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  }

  function stringToken(): Readonly<{ decoded: string; end: number }> {
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '"') {
        cursor += 1;
        return {
          decoded: JSON.parse(source.slice(start, cursor)) as string,
          end: cursor,
        };
      }
      if (character === "\\") {
        cursor += source[cursor + 1] === "u" ? 6 : 2;
      } else {
        cursor += 1;
      }
    }
    return { decoded: "", end: cursor };
  }

  function scalar(): void {
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  }

  function value(path: string): void {
    skipWhitespace();
    const character = source[cursor];
    if (character === "{") {
      object(path);
    } else if (character === "[") {
      array(path);
    } else if (character === '"') {
      stringToken();
    } else {
      scalar();
    }
  }

  function object(path: string): void {
    cursor += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (source[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      skipWhitespace();
      const token = stringToken();
      const childPath = `${path}.${token.decoded}`;
      if (keys.has(token.decoded)) {
        finding(
          findings,
          "F2_JSON_DUPLICATE_KEY",
          `${filename}:${childPath}`,
          "Reviewed fixture JSON contains a duplicate decoded object key.",
        );
      }
      keys.add(token.decoded);
      skipWhitespace();
      cursor += 1;
      value(childPath);
      skipWhitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      cursor += 1;
    }
  }

  function array(path: string): void {
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return;
    }
    let index = 0;
    while (cursor < source.length) {
      value(`${path}[${String(index)}]`);
      index += 1;
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      cursor += 1;
    }
  }

  value("$");
}

async function parseJson(
  root: string,
  filename: string,
  findings: F2ContractFinding[],
): Promise<ParsedJson | undefined> {
  let source: string;
  try {
    source = await readFile(join(root, filename), "utf8");
  } catch {
    finding(findings, "F2_COMPANION_MISSING", filename, "Required reviewed JSON file is missing.");
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    finding(
      findings,
      "F2_CONTRACT_JSON",
      filename,
      error instanceof Error ? error.message : "Unable to parse reviewed JSON.",
    );
    return undefined;
  }
  if (!isObject(parsed)) {
    finding(findings, "F2_CONTRACT_ROOT", filename, "Reviewed JSON root must be an object.");
    return undefined;
  }
  try {
    scanDuplicateJsonKeys(source, filename, findings);
  } catch {
    finding(
      findings,
      "F2_JSON_SCAN",
      filename,
      "Reviewed JSON duplicate-key scan did not terminate safely.",
    );
  }
  return {
    filename,
    source,
    root: parsed,
    digest: createHash("sha256").update(source).digest("hex"),
  };
}

function casesFrom(
  parsed: ParsedJson | undefined,
  findings: F2ContractFinding[],
): readonly FixtureCase[] {
  if (!parsed) return [];
  const rawCases = parsed.root["cases"];
  if (!Array.isArray(rawCases)) {
    finding(findings, "F2_CASE_COLLECTION", `${parsed.filename}:$.cases`, "Cases must be an array.");
    return [];
  }
  const result: FixtureCase[] = [];
  let previous = "";
  for (let index = 0; index < rawCases.length; index += 1) {
    const raw: unknown = rawCases[index];
    const path = `${parsed.filename}:$.cases[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") {
      finding(findings, "F2_CASE_SHAPE", path, "Every case requires an ID and object record.");
      continue;
    }
    const id = raw["id"];
    if (id <= previous) {
      finding(findings, "F2_CASE_ID_ORDER", `${path}.id`, "Case IDs must be strictly lexical.");
    }
    previous = id;
    if (!/^F2-[A-Z]+-[0-9]{3}$/u.test(id)) {
      finding(findings, "F2_CASE_ID", `${path}.id`, "Case ID does not use the reviewed F2 form.");
    }
    if (typeof raw["kind"] !== "string" || raw["kind"].trim().length === 0 || !isObject(raw["expected"])) {
      finding(findings, "F2_CASE_SHAPE", path, "Every case requires a nonempty kind and expected object.");
    }
    const traceIds = strings(raw["traceIds"]);
    const authorityIds = strings(raw["authorityIds"]);
    if (traceIds.length === 0 || authorityIds.length === 0) {
      finding(findings, "F2_CASE_TRACE", path, "Every case requires trace and authority backlinks.");
    }
    result.push({ id, path, traceIds, authorityIds, record: raw });
  }
  return result;
}

function validateObjectSchemas(
  manifest: JsonObject,
  findings: F2ContractFinding[],
): number {
  const raw = manifest["objectSchemas"];
  if (!Array.isArray(raw)) {
    finding(findings, "F2_OBJECT_SCHEMAS", "f2-decoder-contract.json:$.objectSchemas", "Object schemas must be an array.");
    return 0;
  }
  const actualIds: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item: unknown = raw[index];
    const path = `f2-decoder-contract.json:$.objectSchemas[${String(index)}]`;
    if (!isObject(item) || typeof item["id"] !== "string") {
      finding(findings, "F2_OBJECT_SCHEMA", path, "Object schema requires an ID.");
      continue;
    }
    actualIds.push(item["id"]);
    const expectedFields = EXPECTED_OBJECT_SCHEMA_FIELDS.get(item["id"]);
    const expectedDiscriminator = EXPECTED_OBJECT_SCHEMA_DISCRIMINATORS.get(
      item["id"],
    );
    const expectedOptionalFields = EXPECTED_OBJECT_SCHEMA_OPTIONAL_FIELDS.get(
      item["id"],
    );
    const expectedRecord = expectedFields
      ? {
          id: item["id"],
          ...(expectedDiscriminator
            ? { discriminator: expectedDiscriminator }
            : {}),
          requiredFields: expectedFields,
          ...(expectedOptionalFields
            ? { optionalFields: expectedOptionalFields }
            : {}),
        }
      : undefined;
    if (!expectedRecord || !jsonEqual(item, expectedRecord)) {
      finding(findings, "F2_OBJECT_SCHEMA", path, "Exact object schema surface, discriminator, or fields drifted.");
    }
  }
  if (!jsonEqual(actualIds, [...EXPECTED_OBJECT_SCHEMA_FIELDS.keys()])) {
    finding(findings, "F2_OBJECT_SCHEMA_INVENTORY", "f2-decoder-contract.json:$.objectSchemas", "Object schema IDs and order drifted.");
  }
  return raw.length;
}

function validateIssueCodes(
  value: unknown,
  path: string,
  findings: F2ContractFinding[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index: number) => {
      validateIssueCodes(item, `${path}[${String(index)}]`, findings);
    });
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === "code" && typeof child === "string" && !ALLOWED_EXPECTED_ISSUE_CODES.has(child)) {
      finding(findings, "F2_EXPECTED_ISSUE_CODE_UNKNOWN", childPath, `Unknown or wrong-stage expected issue code ${child}.`);
    }
    if (key === "path" && Array.isArray(child)) {
      if (!child.every((segment) => typeof segment === "string" || (typeof segment === "number" && Number.isSafeInteger(segment)))) {
        finding(findings, "F2_EXPECTED_PATH", childPath, "Diagnostic paths contain only strings and safe integer indices.");
      }
    }
    validateIssueCodes(child, childPath, findings);
  }
}

function collectExpectedIssueCodes(
  value: unknown,
  result: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) collectExpectedIssueCodes(item, result);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "code" && typeof child === "string") result.add(child);
    collectExpectedIssueCodes(child, result);
  }
}

function compareFixturePaths(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (typeof leftSegment === "number" && typeof rightSegment === "number") {
      if (leftSegment !== rightSegment) return leftSegment - rightSegment;
    } else if (
      typeof leftSegment === "string" &&
      typeof rightSegment === "string"
    ) {
      if (leftSegment < rightSegment) return -1;
      if (leftSegment > rightSegment) return 1;
    } else {
      return typeof leftSegment === "number" ? -1 : 1;
    }
  }
  return left.length - right.length;
}

function validateExpectedIssueArrays(
  value: unknown,
  path: string,
  findings: F2ContractFinding[],
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      validateExpectedIssueArrays(
        value[index] as unknown,
        `${path}[${String(index)}]`,
        findings,
      );
    }
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === "issues") {
      if (!Array.isArray(child) || child.length === 0) {
        finding(findings, "F2_EXPECTED_ISSUES", childPath, "Expected issues must be a nonempty array.");
      } else {
        let previous:
          | Readonly<{ code: string; path: readonly (string | number)[] }>
          | undefined;
        for (let index = 0; index < child.length; index += 1) {
          const raw: unknown = child[index];
          const issuePath = `${childPath}[${String(index)}]`;
          if (
            !isObject(raw) ||
            !jsonEqual(Object.keys(raw), ["code", "path"]) ||
            typeof raw["code"] !== "string" ||
            !Array.isArray(raw["path"]) ||
            !raw["path"].every(
              (segment: unknown) =>
                typeof segment === "string" ||
                (typeof segment === "number" &&
                  Number.isSafeInteger(segment) &&
                  segment >= 0),
            )
          ) {
            finding(findings, "F2_EXPECTED_ISSUES", issuePath, "Issue must contain exactly a reviewed code and nonnegative DomainPath.");
            continue;
          }
          const current = {
            code: raw["code"],
            path: raw["path"] as (string | number)[],
          };
          if (previous) {
            const pathComparison = compareFixturePaths(previous.path, current.path);
            const codeComparison = previous.code < current.code
              ? -1
              : previous.code > current.code
                ? 1
                : 0;
            if (pathComparison > 0 || (pathComparison === 0 && codeComparison >= 0)) {
              finding(findings, "F2_EXPECTED_ISSUE_ORDER", issuePath, "Issue arrays must be strictly sorted by path then code with no duplicates.");
            }
          }
          previous = current;
        }
      }
    }
    validateExpectedIssueArrays(child, childPath, findings);
  }
}

function recordsById(
  value: unknown,
  filename: string,
  collection: string,
  findings: F2ContractFinding[],
): ReadonlyMap<string, JsonObject> {
  if (!isObject(value) || !Array.isArray(value[collection])) {
    finding(findings, "F2_LEDGER_COLLECTION", `${filename}:$.${collection}`, "Ledger collection is missing.");
    return new Map();
  }
  const result = new Map<string, JsonObject>();
  let previous = "";
  const records = value[collection] as unknown[];
  records.forEach((raw: unknown, index: number) => {
    const path = `${filename}:$.${collection}[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") {
      finding(findings, "F2_LEDGER_RECORD", path, "Ledger record requires an ID.");
      return;
    }
    if (raw["id"] <= previous) {
      finding(findings, "F2_LEDGER_ORDER", `${path}.id`, "Ledger IDs must be strictly lexical.");
    }
    previous = raw["id"];
    if (result.has(raw["id"])) {
      finding(findings, "F2_LEDGER_DUPLICATE", `${path}.id`, "Ledger ID is duplicated.");
    }
    result.set(raw["id"], raw);
  });
  return result;
}

function validateReferences(
  cases: readonly FixtureCase[],
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: F2ContractFinding[],
): void {
  const casesById = new Map(cases.map((item) => [item.id, item]));
  const traceProofClassification = [...traces].map(([id, trace]) => ({
    id,
    proofKinds: trace["proofKinds"],
    proofCaseIds: trace["proofCaseIds"],
  }));
  if (
    semanticSha256(traceProofClassification) !==
    EXPECTED_TRACE_PROOF_CLASSIFICATION_SHA256
  ) {
    finding(
      findings,
      "F2_TRACE_PROOF_CLASSIFICATION",
      "trace-ledger.json:$.traces",
      "Trace proof kinds and their exact case classifications drifted from the independently reviewed ledger.",
    );
  }
  const traceUse = new Set<string>();
  const authorityUse = new Set<string>();
  const proofUse = new Set<string>();
  for (const fixtureCase of cases) {
    for (const traceId of fixtureCase.traceIds) {
      if (!traces.has(traceId)) {
        finding(findings, "F2_TRACE_UNKNOWN", `${fixtureCase.path}.traceIds`, `Unknown trace ${traceId}.`);
      } else traceUse.add(traceId);
    }
    for (const authorityId of fixtureCase.authorityIds) {
      if (!authorities.has(authorityId)) {
        finding(findings, "F2_AUTHORITY_UNKNOWN", `${fixtureCase.path}.authorityIds`, `Unknown authority ${authorityId}.`);
      } else authorityUse.add(authorityId);
    }
  }
  for (const [id, trace] of traces) {
    if (!traceUse.has(id)) finding(findings, "F2_TRACE_ORPHAN", `trace-ledger.json:${id}`, "Trace has no case backlink.");
    if (typeof trace["parentClause"] !== "string" || trace["parentClause"].trim().length === 0) {
      finding(findings, "F2_TRACE_SHAPE", `trace-ledger.json:${id}.parentClause`, "Trace requires a parent clause.");
    }
    const sourceRefs = uniqueStrings(trace["sourceRefs"]);
    if (sourceRefs.length === 0) {
      finding(findings, "F2_TRACE_SHAPE", `trace-ledger.json:${id}.sourceRefs`, "Trace requires unique stable source references.");
    }
    const required = uniqueStrings(trace["requiredCaseIds"]);
    if (required.length === 0) finding(findings, "F2_TRACE_SHAPE", `trace-ledger.json:${id}.requiredCaseIds`, "Trace requires exact cases.");
    for (const caseId of required) {
      const fixtureCase = casesById.get(caseId);
      if (!fixtureCase) {
        finding(findings, "F2_TRACE_CASE_UNKNOWN", `trace-ledger.json:${id}.requiredCaseIds`, `Unknown case ${caseId}.`);
      } else if (!fixtureCase.traceIds.includes(id)) {
        finding(findings, "F2_TRACE_CASE_BACKLINK", fixtureCase.path, `${caseId} does not link back to ${id}.`);
      }
    }
    const proofKinds = uniqueStrings(trace["proofKinds"]);
    if (proofKinds.length === 0) {
      finding(findings, "F2_TRACE_PROOF_MAP", `trace-ledger.json:${id}.proofKinds`, "Trace requires unique proof kinds.");
    }
    if (!isObject(trace["proofCaseIds"])) {
      finding(findings, "F2_TRACE_PROOF_MAP", `trace-ledger.json:${id}.proofCaseIds`, "Trace requires a proof-kind map.");
    } else {
      const classifiedRequired = new Set<string>();
      if (!jsonEqual(Object.keys(trace["proofCaseIds"]), proofKinds)) {
        finding(findings, "F2_TRACE_PROOF_MAP", `trace-ledger.json:${id}.proofCaseIds`, "Proof-map keys must exactly match proofKinds in order.");
      }
      for (const proofKind of proofKinds) {
        const proofIds = uniqueStrings(trace["proofCaseIds"][proofKind]);
        if (proofIds.length === 0) {
          finding(findings, "F2_TRACE_PROOF_MAP", `trace-ledger.json:${id}.proofCaseIds.${proofKind}`, "Every proof kind requires unique case IDs.");
        }
        for (const caseId of proofIds) {
          classifiedRequired.add(caseId);
          proofUse.add(caseId);
          const fixtureCase = casesById.get(caseId);
          if (!fixtureCase) {
            finding(findings, "F2_TRACE_PROOF_CASE_UNKNOWN", `trace-ledger.json:${id}.proofCaseIds.${proofKind}`, `Unknown proof case ${caseId}.`);
          } else {
            if (!fixtureCase.traceIds.includes(id)) {
              finding(findings, "F2_TRACE_CASE_BACKLINK", fixtureCase.path, `${caseId} proof does not link back to ${id}.`);
            }
            if (!required.includes(caseId)) {
              finding(findings, "F2_TRACE_PROOF_MAP", `trace-ledger.json:${id}.proofCaseIds.${proofKind}`, `${caseId} is not in requiredCaseIds.`);
            }
          }
        }
      }
      if (!jsonEqual([...classifiedRequired].sort(), [...required].sort())) {
        finding(findings, "F2_TRACE_PROOF_COVERAGE", `trace-ledger.json:${id}.proofCaseIds`, "Proof-kind case union must exactly cover requiredCaseIds.");
      }
    }
  }
  for (const fixtureCase of cases) {
    if (!proofUse.has(fixtureCase.id)) {
      finding(findings, "F2_CASE_PROOF_ORPHAN", fixtureCase.path, `${fixtureCase.id} is not classified by any trace proof kind.`);
    }
  }
  for (const [id, authority] of authorities) {
    if (!authorityUse.has(id)) finding(findings, "F2_AUTHORITY_ORPHAN", `provenance-ledger.json:${id}`, "Authority has no case backlink.");
    if (typeof authority["covers"] !== "string" || authority["covers"].trim().length === 0 || strings(authority["sourceRefs"]).length === 0) {
      finding(findings, "F2_AUTHORITY_SHAPE", `provenance-ledger.json:${id}`, "Authority requires coverage and source references.");
    }
    if (authority["expectationClass"] === "external-definition" && !strings(authority["sourceRefs"]).some((ref) => ref.startsWith("https://"))) {
      finding(findings, "F2_AUTHORITY_EXTERNAL", `provenance-ledger.json:${id}.sourceRefs`, "External definitions require HTTPS sources.");
    }
  }
}

function validateEmbeddedFixtureReferences(
  value: unknown,
  path: string,
  executableActivations: ReadonlySet<string>,
  fragmentIds: ReadonlySet<string>,
  findings: F2ContractFinding[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child: unknown, index: number) => {
      validateEmbeddedFixtureReferences(
        child,
        `${path}[${String(index)}]`,
        executableActivations,
        fragmentIds,
        findings,
      );
    });
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (
      (key === "activation" ||
        key === "chordActivation" ||
        key === "voicingActivation") &&
      typeof child === "string" &&
      /^[A-Za-z][A-Za-z0-9+-]*$/u.test(child) &&
      !executableActivations.has(child)
    ) {
      finding(
        findings,
        "F2_ACTIVATION_REFERENCE",
        childPath,
        `Unknown or non-executable activation ${child}.`,
      );
    }
    if (key === "activations") {
      if (!Array.isArray(child) || child.length === 0) {
        finding(
          findings,
          "F2_ACTIVATION_REFERENCE",
          childPath,
          "An activations list must contain executable activation IDs.",
        );
      } else {
        child.forEach((activation: unknown, index: number) => {
          if (
            typeof activation !== "string" ||
            !executableActivations.has(activation)
          ) {
            finding(
              findings,
              "F2_ACTIVATION_REFERENCE",
              `${childPath}[${String(index)}]`,
              "An activations list references an unknown or non-executable activation.",
            );
          }
        });
      }
    }
    if (
      key === "fragment" &&
      typeof child === "string" &&
      !fragmentIds.has(child)
    ) {
      finding(
        findings,
        "F2_FRAGMENT_REFERENCE",
        childPath,
        `Unknown branch fragment ${child}.`,
      );
    }
    if (key === "fragments") {
      if (!isObject(child) || Object.keys(child).length === 0) {
        finding(
          findings,
          "F2_FRAGMENT_REFERENCE",
          childPath,
          "A fragments map must name at least one executable branch fragment.",
        );
      } else {
        for (const [slot, fragment] of Object.entries(child)) {
          if (
            !["chord", "voicing"].includes(slot) ||
            typeof fragment !== "string" ||
            !fragmentIds.has(fragment)
          ) {
            finding(
              findings,
              "F2_FRAGMENT_REFERENCE",
              `${childPath}.${slot}`,
              "Every chord/voicing fragments-map entry must resolve to a reviewed branch fragment.",
            );
          }
        }
      }
    }
    validateEmbeddedFixtureReferences(
      child,
      childPath,
      executableActivations,
      fragmentIds,
      findings,
    );
  }
}

function validateQualifiedShapeReferences(
  value: unknown,
  path: string,
  shape: JsonObject,
  findings: F2ContractFinding[],
): void {
  if (typeof value === "string") {
    const prefix = "shape-cases.json:";
    if (!value.startsWith(prefix)) return;
    const segments = value.slice(prefix.length).split(".");
    let cursor: unknown = shape;
    for (const segment of segments) {
      if (
        !isObject(cursor) ||
        !Object.prototype.hasOwnProperty.call(cursor, segment)
      ) {
        finding(
          findings,
          "F2_MATERIALIZATION_REFERENCE",
          path,
          `Qualified shape fixture reference ${value} does not resolve exactly.`,
        );
        return;
      }
      cursor = cursor[segment];
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child: unknown, index: number) => {
      validateQualifiedShapeReferences(
        child,
        `${path}[${String(index)}]`,
        shape,
        findings,
      );
    });
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    validateQualifiedShapeReferences(
      child,
      `${path}.${key}`,
      shape,
      findings,
    );
  }
}

function validateMaterializationProtocols(
  shape: JsonObject | undefined,
  adversarial: JsonObject | undefined,
  findings: F2ContractFinding[],
): Readonly<{
  activationProtocol: JsonObject;
  branchFragments: JsonObject;
  representative?: unknown;
}> {
  const empty = {
    activationProtocol: {},
    branchFragments: {},
  };
  if (!shape) return empty;
  const materialization = shape["materializationProtocol"];
  if (!isObject(materialization)) {
    finding(
      findings,
      "F2_MATERIALIZATION_PROTOCOL",
      "shape-cases.json:$.materializationProtocol",
      "The shape fixture requires a materialization protocol.",
    );
  } else {
    if (!jsonEqual(Object.keys(materialization), REQUIRED_MATERIALIZATION_PROTOCOL_KEYS)) {
      finding(
        findings,
        "F2_MATERIALIZATION_PROTOCOL",
        "shape-cases.json:$.materializationProtocol",
        "Materialization protocol keys or order drifted.",
      );
    }
    for (const key of REQUIRED_MATERIALIZATION_PROTOCOL_KEYS) {
      if (key === "productionOracleForbidden") {
        if (materialization[key] !== true) {
          finding(
            findings,
            "F2_MATERIALIZATION_PROTOCOL",
            `shape-cases.json:$.materializationProtocol.${key}`,
            "Production output must remain forbidden as a fixture oracle.",
          );
        }
      } else if (
        typeof materialization[key] !== "string" ||
        materialization[key].trim().length === 0
      ) {
        finding(
          findings,
          "F2_MATERIALIZATION_PROTOCOL",
          `shape-cases.json:$.materializationProtocol.${key}`,
          "Every materialization operation requires a nonempty definition.",
        );
      }
    }
    if (
      semanticSha256(materialization) !==
      EXPECTED_MATERIALIZATION_PROTOCOL_SHA256
    ) {
      finding(
        findings,
        "F2_MATERIALIZATION_PROTOCOL",
        "shape-cases.json:$.materializationProtocol",
        "Materialization operations must retain the exact independently reviewed semantics.",
      );
    }
  }

  const templates = shape["templates"];
  const representative = isObject(templates)
    ? templates["representativeDocument"]
    : undefined;
  if (!isObject(templates) || !isObject(representative)) {
    finding(
      findings,
      "F2_MATERIALIZATION_PROTOCOL",
      "shape-cases.json:$.templates.representativeDocument",
      "Target validation requires the representative document template.",
    );
  }

  const rawFragments = shape["branchFragments"];
  const branchFragments = isObject(rawFragments) ? rawFragments : {};
  if (
    !isObject(rawFragments) ||
    !jsonEqual(Object.keys(rawFragments), EXPECTED_BRANCH_FRAGMENT_IDS) ||
    Object.values(rawFragments).some((fragment) => !isObject(fragment))
  ) {
    finding(
      findings,
      "F2_FRAGMENT_INVENTORY",
      "shape-cases.json:$.branchFragments",
      "Branch fragment IDs, order, or object values drifted.",
    );
  }

  const rawActivationProtocol = shape["activationProtocol"];
  const activationProtocol = isObject(rawActivationProtocol)
    ? rawActivationProtocol
    : {};
  if (
    !isObject(rawActivationProtocol) ||
    !jsonEqual(Object.keys(rawActivationProtocol), EXPECTED_ACTIVATION_PROTOCOL_KEYS)
  ) {
    finding(
      findings,
      "F2_ACTIVATION_PROTOCOL",
      "shape-cases.json:$.activationProtocol",
      "Activation IDs or order drifted.",
    );
  }
  for (const activationId of EXPECTED_EXECUTABLE_ACTIVATION_IDS) {
    const operations = activationProtocol[activationId];
    if (!Array.isArray(operations) || operations.length === 0) {
      finding(
        findings,
        "F2_ACTIVATION_PROTOCOL",
        `shape-cases.json:$.activationProtocol.${activationId}`,
        "Executable activations require a nonempty operation list.",
      );
      continue;
    }
    if (
      representative !== undefined &&
      activatedRepresentative(
        representative,
        [activationId],
        activationProtocol,
        branchFragments,
      ) === undefined
    ) {
      finding(
        findings,
        "F2_ACTIVATION_PROTOCOL",
        `shape-cases.json:$.activationProtocol.${activationId}`,
        "Activation operations, target paths, or fragment references are not executable against the representative document.",
      );
    }
  }

  const executableActivations = new Set<string>(
    EXPECTED_EXECUTABLE_ACTIVATION_IDS,
  );
  const fragmentIds = new Set<string>(EXPECTED_BRANCH_FRAGMENT_IDS);
  validateEmbeddedFixtureReferences(
    shape,
    "shape-cases.json:$",
    executableActivations,
    fragmentIds,
    findings,
  );
  validateEmbeddedFixtureReferences(
    adversarial,
    "adversarial-cases.json:$",
    executableActivations,
    fragmentIds,
    findings,
  );
  validateQualifiedShapeReferences(
    shape,
    "shape-cases.json:$",
    shape,
    findings,
  );
  validateQualifiedShapeReferences(
    adversarial,
    "adversarial-cases.json:$",
    shape,
    findings,
  );
  return { activationProtocol, branchFragments, representative };
}

function fixtureFieldTypeMatches(value: unknown, fieldType: string): boolean {
  if (fieldType === "array") return Array.isArray(value);
  if (fieldType === "nullableRecord") return value === null || isObject(value);
  if (fieldType === "nullableString") return value === null || typeof value === "string";
  if (fieldType === "number") return typeof value === "number";
  if (fieldType === "record") return isObject(value);
  if (fieldType === "string") return typeof value === "string";
  return false;
}

function validateSchemaVariantTargets(
  shape: JsonObject | undefined,
  manifest: JsonObject,
  representative: unknown,
  activationProtocol: JsonObject,
  branchFragments: JsonObject,
  findings: F2ContractFinding[],
): number {
  if (!shape) return 0;
  const targets = shape["schemaVariantTargets"];
  const schemas = manifest["objectSchemas"];
  if (!Array.isArray(targets) || !Array.isArray(schemas)) {
    finding(
      findings,
      "F2_SCHEMA_VARIANT_INVENTORY",
      "shape-cases.json:$.schemaVariantTargets",
      "Schema variant targets and object schemas must both be arrays.",
    );
    return 0;
  }
  const schemaIds = schemas.map((schema: unknown) =>
    isObject(schema) ? schema["id"] : undefined
  );
  const targetIds = targets.map((target: unknown) =>
    isObject(target) ? target["schemaId"] : undefined
  );
  if (!jsonEqual(targetIds, schemaIds)) {
    finding(
      findings,
      "F2_SCHEMA_VARIANT_INVENTORY",
      "shape-cases.json:$.schemaVariantTargets",
      "Every object schema requires one target record in exact schema order.",
    );
  }

  const schemaById = new Map<string, JsonObject>();
  for (const schema of schemas) {
    if (isObject(schema) && typeof schema["id"] === "string") {
      schemaById.set(schema["id"], schema);
    }
  }
  let variantCount = 0;
  targets.forEach((target: unknown, targetIndex: number) => {
    const targetPath = `shape-cases.json:$.schemaVariantTargets[${String(targetIndex)}]`;
    if (!isObject(target) || typeof target["schemaId"] !== "string") {
      finding(
        findings,
        "F2_SCHEMA_VARIANT",
        targetPath,
        "A schema target record requires a schema ID.",
      );
      return;
    }
    const schema = schemaById.get(target["schemaId"]);
    const variants = target["variants"];
    if (!schema || !Array.isArray(variants) || variants.length === 0) {
      finding(
        findings,
        "F2_SCHEMA_VARIANT",
        targetPath,
        "A known schema target requires at least one variant.",
      );
      return;
    }
    const requiredFields = strings(schema["requiredFields"]);
    const discriminator = isObject(schema["discriminator"])
      ? schema["discriminator"]
      : undefined;
    const discriminatorValues = discriminator
      ? strings(discriminator["values"])
      : [];
    const observedVariantLabels: string[] = [];
    variants.forEach((variant: unknown, variantIndex: number) => {
      variantCount += 1;
      const variantPath = `${targetPath}.variants[${String(variantIndex)}]`;
      if (
        !isObject(variant) ||
        !fixturePath(variant["path"]) ||
        !isObject(variant["fieldTypes"])
      ) {
        finding(
          findings,
          "F2_SCHEMA_VARIANT",
          variantPath,
          "A variant requires a DomainPath and exact fieldTypes record.",
        );
        return;
      }
      const activationIds = activationNamesFromRecord(variant);
      const document = activatedRepresentative(
        representative,
        activationIds,
        activationProtocol,
        branchFragments,
      );
      const node = document === undefined
        ? { exists: false }
        : ownValueAtPath(document, variant["path"]);
      if (!node.exists || !isObject(node.value)) {
        finding(
          findings,
          "F2_TARGET_REFERENCE",
          `${variantPath}.path`,
          "Schema variant path does not resolve to a record after activation.",
        );
        return;
      }
      const fieldTypes = variant["fieldTypes"];
      if (!jsonEqual(Object.keys(fieldTypes), requiredFields)) {
        finding(
          findings,
          "F2_SCHEMA_VARIANT",
          `${variantPath}.fieldTypes`,
          "fieldTypes keys must exactly match requiredFields in order.",
        );
      }
      for (const field of requiredFields) {
        const fieldType = fieldTypes[field];
        if (
          typeof fieldType !== "string" ||
          !EXPECTED_SCHEMA_FIELD_TYPES.has(fieldType) ||
          !Object.prototype.hasOwnProperty.call(node.value, field) ||
          !fixtureFieldTypeMatches(node.value[field], fieldType)
        ) {
          finding(
            findings,
            "F2_SCHEMA_VARIANT",
            `${variantPath}.fieldTypes.${field}`,
            "Field type metadata must match the activated template value.",
          );
        }
      }
      if (typeof variant["consumer"] === "string") {
        observedVariantLabels.push(`consumer:${variant["consumer"]}`);
      } else if (typeof variant["discriminator"] === "string") {
        observedVariantLabels.push(`discriminator:${variant["discriminator"]}`);
      } else if (variants.length > 1) {
        finding(
          findings,
          "F2_SCHEMA_VARIANT",
          variantPath,
          "Multiple variants require distinct consumer or discriminator labels.",
        );
      }
      if (discriminator) {
        const field = discriminator["field"];
        const value = typeof field === "string" ? node.value[field] : undefined;
        if (!discriminatorValues.includes(value as string)) {
          finding(
            findings,
            "F2_SCHEMA_VARIANT",
            variantPath,
            "Activated target does not use a reviewed discriminator value.",
          );
        }
        if (
          typeof variant["discriminator"] === "string" &&
          variant["discriminator"] !== value
        ) {
          finding(
            findings,
            "F2_SCHEMA_VARIANT",
            `${variantPath}.discriminator`,
            "Variant discriminator does not match the activated record.",
          );
        }
      }
    });
    if (new Set(observedVariantLabels).size !== observedVariantLabels.length) {
      finding(
        findings,
        "F2_SCHEMA_VARIANT",
        `${targetPath}.variants`,
        "Variant consumer and discriminator labels must be unique.",
      );
    }
    if (
      discriminatorValues.length > 1 &&
      !jsonEqual(
        variants.map((variant: unknown) =>
          isObject(variant) ? variant["discriminator"] : undefined
        ),
        discriminatorValues,
      )
    ) {
      finding(
        findings,
        "F2_SCHEMA_VARIANT",
        `${targetPath}.variants`,
        "Multi-value discriminator variants must cover values in reviewed order.",
      );
    }
  });
  return variantCount;
}

function caseRecordById(
  cases: readonly FixtureCase[],
  id: string,
): JsonObject | undefined {
  return cases.find((fixtureCase) => fixtureCase.id === id)?.record;
}

function validateReviewedSemanticInventories(
  shapeCases: readonly FixtureCase[],
  adversarialCases: readonly FixtureCase[],
  adversarial: JsonObject | undefined,
  findings: F2ContractFinding[],
): void {
  if (!adversarial) return;
  const allCases = [...shapeCases, ...adversarialCases];
  const boundary = caseRecordById(allCases, "F2-BOUNDARY-001");
  const rootShape = caseRecordById(allCases, "F2-SHAPE-008");
  const hostAccessor = caseRecordById(allCases, "F2-HOST-001");
  const hostPrototype = caseRecordById(allCases, "F2-HOST-002");
  const hostNames = caseRecordById(allCases, "F2-HOST-003");
  const enumCase = caseRecordById(allCases, "F2-FIELD-005");
  const idDuplicate = caseRecordById(allCases, "F2-ID-003");
  const limit = caseRecordById(allCases, "F2-LIMIT-011");
  const shapeMismatch = caseRecordById(allCases, "F2-SHAPE-005");
  const text = caseRecordById(allCases, "F2-TEXT-002");
  const time = caseRecordById(allCases, "F2-TIME-001");
  const numericValues = caseRecordById(allCases, "F2-VALUE-001");
  const values = caseRecordById(allCases, "F2-VALUE-002");

  const criticalCellInventories = {
    boundaryInputs: boundary?.["inputs"],
    rootInputs: rootShape?.["inputs"],
    hostAccessorPaths: hostAccessor?.["paths"],
    hostAccessorDescriptors: hostAccessor?.["descriptors"],
    prototypeCells: hostPrototype?.["cells"],
    dangerousNameCells: hostNames?.["cells"],
    enumCells: enumCase?.["cells"],
    sameEventSiblingReachabilityCells:
      limit?.["crossSiblingReachabilityCells"],
    idBoundaryCells: values?.["idBoundaryCells"],
    storedPitchOctaveFaults: values?.["storedPitchOctaveFaults"],
    additionalDegreeNumberRefusalCell:
      values?.["additionalDegreeNumberRefusalCell"],
    freeTextConsumerCoDiagnosticCells:
      text?.["consumerCoDiagnosticCells"],
    expectedDurationBeatCells: time?.["expectedDurationBeatCells"],
    mismatchPrimaryMutations: shapeMismatch?.["mutations"],
    mismatchFrozenCounterpart: shapeMismatch?.["frozenCounterpart"],
    duplicateInvalidSiblingCounterpart:
      idDuplicate?.["invalidSiblingCounterpart"],
    preflightBeforeSemanticCells: limit?.["preflightBeforeSemanticCells"],
    degreeNegativeZeroPreservationCells:
      values?.["degreeNegativeZeroPreservationCells"],
    additionalNegativeZeroPreservationCells:
      values?.["additionalNegativeZeroPreservationCells"],
    valueCaseExpected: values?.["expected"],
    valuePitchClassTargets:
      values?.["invalidPitchClassConsumerTargets"],
    hostileCaseRecords: allCases
      .filter((fixtureCase) => fixtureCase.id.startsWith("F2-HOST-"))
      .map((fixtureCase) => fixtureCase.record),
  };
  if (
    semanticSha256(criticalCellInventories) !==
    EXPECTED_CRITICAL_CELL_INVENTORIES_SHA256
  ) {
    finding(
      findings,
      "F2_CRITICAL_CELL_INVENTORY",
      "shape-cases.json:$.cases",
      "Direct-input, hostile-host, accessor-path, enum, time, mismatch-counterpart, preflight-precedence, reachability, ID-boundary, negative-zero, consumer-shortcut, or free-text co-diagnostic cells drifted from their exact reviewed snapshots.",
    );
  }

  const targetRegistries = {
    arrayConsumerTargets: adversarial["arrayConsumerTargets"],
    freeTextTargets: text?.["freeTextTargets"],
    expectedDurationConsumerTargets: time?.["expectedDurationConsumerTargets"],
    midiConsumerTargets: numericValues?.["midiConsumerTargets"],
    playbackLevelTargets: numericValues?.["playbackLevelTargets"],
    idConsumerTargets: values?.["idConsumerTargets"],
    invalidPitchClassConsumerTargets:
      values?.["invalidPitchClassConsumerTargets"],
    storedPitchConsumerTargets: values?.["storedPitchConsumerTargets"],
    acceptedPitchAxes: values?.["acceptedPitchAxes"],
    storedPitchOctaveBoundaryValues:
      values?.["storedPitchOctaveBoundaryValues"],
  };
  if (semanticSha256(targetRegistries) !== EXPECTED_TARGET_REGISTRIES_SHA256) {
    finding(
      findings,
      "F2_TARGET_INVENTORY",
      "shape-cases.json:$.cases",
      "Array, text, ID, pitch, duration, MIDI, and playback target registries drifted from their exact reviewed snapshots.",
    );
  }
  if (
    !jsonEqual(values?.["acceptedPitchAxes"], [
      { field: "step", values: EXPECTED_INVENTORIES.steps },
      { field: "alter", values: EXPECTED_INVENTORIES.alterations },
    ])
  ) {
    finding(
      findings,
      "F2_TARGET_INVENTORY",
      "shape-cases.json:F2-VALUE-002.acceptedPitchAxes",
      "Accepted pitch axes must exactly reuse the reviewed step and alteration inventories.",
    );
  }
}

function validateTargetRecordList(
  records: unknown,
  path: string,
  representative: unknown,
  activationProtocol: JsonObject,
  branchFragments: JsonObject,
  findings: F2ContractFinding[],
  options: Readonly<{
    pathKeys?: readonly string[];
    missingLeafAllowed?: boolean;
  }> = {},
): void {
  if (!Array.isArray(records)) {
    finding(
      findings,
      "F2_TARGET_REFERENCE",
      path,
      "A target registry must be an array.",
    );
    return;
  }
  const pathKeys = options.pathKeys ?? ["path", "target", "nodePath"];
  records.forEach((record: unknown, index: number) => {
    const recordPath = `${path}[${String(index)}]`;
    if (!isObject(record)) {
      finding(
        findings,
        "F2_TARGET_REFERENCE",
        recordPath,
        "A target record must be an object.",
      );
      return;
    }
    const key = pathKeys.find((candidate) => fixturePath(record[candidate]));
    if (!key) {
      finding(
        findings,
        "F2_TARGET_REFERENCE",
        recordPath,
        "A target record requires a reviewed DomainPath.",
      );
      return;
    }
    const target = record[key] as FixturePath;
    const document = activatedRepresentative(
      representative,
      activationNamesFromRecord(record),
      activationProtocol,
      branchFragments,
    );
    const inspectedPath = options.missingLeafAllowed
      ? target.slice(0, -1)
      : target;
    if (
      document === undefined ||
      !ownValueAtPath(document, inspectedPath).exists
    ) {
      finding(
        findings,
        "F2_TARGET_REFERENCE",
        `${recordPath}.${key}`,
        "Target path does not resolve after applying its activation.",
      );
    }
  });
}

function validateBareTargetPathList(
  records: unknown,
  path: string,
  representative: unknown,
  findings: F2ContractFinding[],
): void {
  if (!Array.isArray(records)) {
    finding(findings, "F2_TARGET_REFERENCE", path, "A bare target registry must be an array.");
    return;
  }
  records.forEach((record: unknown, index: number) => {
    if (
      !fixturePath(record) ||
      !isObject(representative) ||
      !ownValueAtPath(representative, record).exists
    ) {
      finding(
        findings,
        "F2_TARGET_REFERENCE",
        `${path}[${String(index)}]`,
        "Bare target path does not resolve in the representative document.",
      );
    }
  });
}

function validateFreeTextTargetReferences(
  text: JsonObject,
  findings: F2ContractFinding[],
): void {
  const targets = text["freeTextTargets"];
  const groups = text["cellGroups"];
  if (!Array.isArray(targets) || !Array.isArray(groups)) return;
  const targetIds = new Set<string>();
  targets.forEach((target: unknown, index: number) => {
    if (
      !isObject(target) ||
      typeof target["id"] !== "string" ||
      targetIds.has(target["id"])
    ) {
      finding(
        findings,
        "F2_TARGET_REFERENCE",
        `shape-cases.json:F2-TEXT-002.freeTextTargets[${String(index)}].id`,
        "Every free-text target requires a unique reviewed ID.",
      );
      return;
    }
    targetIds.add(target["id"]);
  });
  groups.forEach((group: unknown, index: number) => {
    const path = `shape-cases.json:F2-TEXT-002.cellGroups[${String(index)}].targetIds`;
    if (!isObject(group)) return;
    if (group["targetIds"] === "all freeTextTargets") return;
    const referencedIds = uniqueStrings(group["targetIds"]);
    if (
      !Array.isArray(group["targetIds"]) ||
      referencedIds.length !== group["targetIds"].length ||
      referencedIds.some((id) => !targetIds.has(id))
    ) {
      finding(
        findings,
        "F2_TARGET_REFERENCE",
        path,
        "Every cell-group target ID must uniquely resolve to a freeTextTargets record.",
      );
    }
  });
  const coDiagnostics = text["consumerCoDiagnosticCells"];
  if (coDiagnostics !== undefined) {
    if (!Array.isArray(coDiagnostics)) {
      finding(
        findings,
        "F2_TARGET_REFERENCE",
        "shape-cases.json:F2-TEXT-002.consumerCoDiagnosticCells",
        "Consumer co-diagnostics must be an ordered array.",
      );
    } else {
      const cellIds = new Set<string>();
      coDiagnostics.forEach((cell: unknown, index: number) => {
        if (
          !isObject(cell) ||
          typeof cell["id"] !== "string" ||
          cellIds.has(cell["id"]) ||
          typeof cell["targetId"] !== "string" ||
          !targetIds.has(cell["targetId"])
        ) {
          finding(
            findings,
            "F2_TARGET_REFERENCE",
            `shape-cases.json:F2-TEXT-002.consumerCoDiagnosticCells[${String(index)}]`,
            "Every consumer co-diagnostic requires a unique ID and one resolving free-text target ID.",
          );
          return;
        }
        cellIds.add(cell["id"]);
      });
    }
  }
}

function validateTargetRegistries(
  shape: JsonObject | undefined,
  adversarial: JsonObject | undefined,
  shapeCases: readonly FixtureCase[],
  representative: unknown,
  activationProtocol: JsonObject,
  branchFragments: JsonObject,
  findings: F2ContractFinding[],
): void {
  if (!shape || !adversarial) return;
  validateTargetRecordList(
    adversarial["arrayConsumerTargets"],
    "adversarial-cases.json:$.arrayConsumerTargets",
    representative,
    activationProtocol,
    branchFragments,
    findings,
  );
  const text = caseRecordById(shapeCases, "F2-TEXT-002");
  if (text) {
    validateTargetRecordList(
      text["freeTextTargets"],
      "shape-cases.json:F2-TEXT-002.freeTextTargets",
      representative,
      activationProtocol,
      branchFragments,
      findings,
    );
    validateFreeTextTargetReferences(text, findings);
  }
  const values = caseRecordById(shapeCases, "F2-VALUE-002");
  if (values) {
    validateTargetRecordList(
      values["idConsumerTargets"],
      "shape-cases.json:F2-VALUE-002.idConsumerTargets",
      representative,
      activationProtocol,
      branchFragments,
      findings,
    );
    validateTargetRecordList(
      values["invalidPitchClassConsumerTargets"],
      "shape-cases.json:F2-VALUE-002.invalidPitchClassConsumerTargets",
      representative,
      activationProtocol,
      branchFragments,
      findings,
    );
    const pitchTargets = values["invalidPitchClassConsumerTargets"];
    const companionTargets = Array.isArray(pitchTargets)
      ? pitchTargets.filter(
          (target: unknown) =>
            isObject(target) &&
            Object.prototype.hasOwnProperty.call(
              target,
              "acceptedAxisCompanion",
            ),
        )
      : [];
    const customBassTarget: unknown = Array.isArray(pitchTargets)
      ? pitchTargets.find(
          (target: unknown) =>
            isObject(target) && target["id"] === "custom-bass",
        )
      : undefined;
    const customBassDocument = isObject(customBassTarget)
      ? activatedRepresentative(
          representative,
          activationNamesFromRecord(customBassTarget),
          activationProtocol,
          branchFragments,
        )
      : undefined;
    const companionPitch = customBassDocument === undefined
      ? { exists: false }
      : ownValueAtPath(
          customBassDocument,
          EXPECTED_CUSTOM_BASS_AXIS_TARGET.acceptedAxisCompanion.path,
        );
    if (
      companionTargets.length !== 1 ||
      !jsonEqual(customBassTarget, EXPECTED_CUSTOM_BASS_AXIS_TARGET) ||
      !companionPitch.exists ||
      !isObject(companionPitch.value) ||
      !jsonEqual(Object.keys(companionPitch.value), [
        "step",
        "alter",
        "octave",
      ]) ||
      typeof companionPitch.value["step"] !== "string" ||
      typeof companionPitch.value["alter"] !== "number" ||
      typeof companionPitch.value["octave"] !== "number"
    ) {
      finding(
        findings,
        "F2_TARGET_INVENTORY",
        "shape-cases.json:F2-VALUE-002.invalidPitchClassConsumerTargets.custom-bass",
        "The Custom-bass accepted axis must uniquely co-vary the activated Manual pitches[0] spelling at octave 3.",
      );
    }
    validateTargetRecordList(
      values["storedPitchConsumerTargets"],
      "shape-cases.json:F2-VALUE-002.storedPitchConsumerTargets",
      representative,
      activationProtocol,
      branchFragments,
      findings,
    );
  }
  const time = caseRecordById(shapeCases, "F2-TIME-001");
  if (time) {
    validateTargetRecordList(
      time["expectedDurationConsumerTargets"],
      "shape-cases.json:F2-TIME-001.expectedDurationConsumerTargets",
      representative,
      activationProtocol,
      branchFragments,
      findings,
    );
  }
  const numericValues = caseRecordById(shapeCases, "F2-VALUE-001");
  if (numericValues) {
    validateBareTargetPathList(
      numericValues["midiConsumerTargets"],
      "shape-cases.json:F2-VALUE-001.midiConsumerTargets",
      representative,
      findings,
    );
    validateBareTargetPathList(
      numericValues["playbackLevelTargets"],
      "shape-cases.json:F2-VALUE-001.playbackLevelTargets",
      representative,
      findings,
    );
  }
  const unknownFields = caseRecordById(shapeCases, "F2-FIELD-003");
  if (unknownFields) {
    validateTargetRecordList(
      unknownFields["variantInappropriateCells"],
      "shape-cases.json:F2-FIELD-003.variantInappropriateCells",
      representative,
      activationProtocol,
      branchFragments,
      findings,
      { missingLeafAllowed: true },
    );
    if (unknownFields["branchNodeTargets"] !== undefined) {
      validateTargetRecordList(
        unknownFields["branchNodeTargets"],
        "shape-cases.json:F2-FIELD-003.branchNodeTargets",
        representative,
        activationProtocol,
        branchFragments,
        findings,
      );
    }
  }
  const chord = caseRecordById(shapeCases, "F2-CHORD-001");
  const expansion = chord && isObject(chord["cellExpansion"])
    ? chord["cellExpansion"]
    : undefined;
  if (expansion) {
    for (const key of [
      "scalarAxes",
      "degreeAxes",
      "degreeAlterAxes",
      "collectionCells",
    ] as const) {
      if (expansion[key] === undefined && key === "degreeAlterAxes") continue;
      validateTargetRecordList(
        expansion[key],
        `shape-cases.json:F2-CHORD-001.cellExpansion.${key}`,
        representative,
        activationProtocol,
        branchFragments,
        findings,
        { pathKeys: ["target"] },
      );
    }
  }
}

function arraySourceCount(
  source: string,
  fixtureCase: JsonObject,
  shape: JsonObject,
  adversarial: JsonObject,
): number | undefined {
  if (source === "negative-zero alter") return 1;
  const nestedValues = source.endsWith(" values");
  const sourceId = nestedValues ? source.slice(0, -" values".length) : source;
  const matrix = isObject(fixtureCase["matrix"])
    ? fixtureCase["matrix"]
    : undefined;
  const value = fixtureCase[sourceId] ?? matrix?.[sourceId] ?? shape[sourceId] ?? adversarial[sourceId];
  if (!Array.isArray(value)) return undefined;
  if (!nestedValues) return value.length;
  return value.reduce((count: number, entry: unknown) =>
    count +
    (isObject(entry) && Array.isArray(entry["values"])
      ? entry["values"].length
      : 0), 0);
}

function variantTargetCount(shape: JsonObject): number | undefined {
  const targets = shape["schemaVariantTargets"];
  if (!Array.isArray(targets)) return undefined;
  let count = 0;
  for (const target of targets) {
    if (!isObject(target) || !Array.isArray(target["variants"])) return undefined;
    count += target["variants"].length;
  }
  return count;
}

function expansionGroupCount(
  group: JsonObject,
  fixtureCase: JsonObject,
  shape: JsonObject,
  adversarial: JsonObject,
): number | undefined {
  const axes = strings(group["axisOrderOuterToInner"]);
  if (group["mode"] === "cartesian" && axes.length > 0) {
    let product = 1;
    for (const axis of axes) {
      const count = arraySourceCount(axis, fixtureCase, shape, adversarial);
      if (count === undefined) return undefined;
      product *= count;
    }
    return product;
  }
  const source = group["source"];
  if (typeof source !== "string") return undefined;
  if (source === "schemaVariantTargets") return variantTargetCount(shape);
  if (source.includes(" x ")) {
    let product = 1;
    for (const axis of source.split(" x ")) {
      const count = arraySourceCount(axis, fixtureCase, shape, adversarial);
      if (count === undefined) return undefined;
      product *= count;
    }
    return product;
  }
  const matrix = isObject(fixtureCase["matrix"])
    ? fixtureCase["matrix"]
    : undefined;
  const value = fixtureCase[source] ?? matrix?.[source] ?? shape[source] ?? adversarial[source];
  if (isObject(value)) return 1;
  if (!Array.isArray(value)) return undefined;
  if (
    (typeof group["order"] === "string" &&
      group["order"].includes("nested values")) ||
    value.some(
      (cell: unknown) => isObject(cell) && Array.isArray(cell["values"]),
    )
  ) {
    return value.reduce((count: number, cell: unknown) => {
      if (!isObject(cell) || !Array.isArray(cell["values"])) return count + 1;
      return count + cell["values"].length;
    }, 0);
  }
  return value.length;
}

function inferredExpansionCount(
  fixtureCase: JsonObject,
  shape: JsonObject,
  adversarial: JsonObject,
  manifest: JsonObject,
  findings: F2ContractFinding[],
  path: string,
): number | undefined {
  const expansion = fixtureCase["cellExpansion"];
  if (Array.isArray(expansion)) return expansion.length;
  if (!isObject(expansion) || typeof expansion["mode"] !== "string") {
    return undefined;
  }
  const mode = expansion["mode"];
  if (mode === "independent-list") {
    const source = expansion["source"];
    return typeof source === "string"
      ? arraySourceCount(source, fixtureCase, shape, adversarial)
      : undefined;
  }
  if (mode === "independent-axes") {
    let count = 0;
    for (const key of ["scalarAxes", "degreeAxes", "degreeAlterAxes"] as const) {
      const axes = expansion[key];
      if (axes === undefined && key === "degreeAlterAxes") continue;
      if (!Array.isArray(axes)) return undefined;
      for (const axis of axes) {
        if (!isObject(axis) || typeof axis["source"] !== "string") return undefined;
        const axisCount = arraySourceCount(
          axis["source"],
          fixtureCase,
          shape,
          adversarial,
        );
        if (axisCount === undefined) return undefined;
        count += axisCount;
      }
    }
    return Array.isArray(expansion["collectionCells"])
      ? count + expansion["collectionCells"].length
      : undefined;
  }
  if (mode === "schema-variant-field") {
    const schemas = manifest["objectSchemas"];
    const targets = shape["schemaVariantTargets"];
    if (!Array.isArray(schemas) || !Array.isArray(targets)) return undefined;
    const variantsById = new Map<string, number>();
    for (const target of targets) {
      if (
        !isObject(target) ||
        typeof target["schemaId"] !== "string" ||
        !Array.isArray(target["variants"])
      ) {
        return undefined;
      }
      variantsById.set(target["schemaId"], target["variants"].length);
    }
    let count = 0;
    for (const schema of schemas) {
      if (
        !isObject(schema) ||
        typeof schema["id"] !== "string" ||
        !Array.isArray(schema["requiredFields"])
      ) {
        return undefined;
      }
      const variants = variantsById.get(schema["id"]);
      if (variants === undefined) return undefined;
      count += variants * schema["requiredFields"].length;
    }
    const tailCells = strings(expansion["tailCells"]);
    for (const tailCell of tailCells) {
      const source = tailCell.split(" ", 1)[0] ?? "";
      const value = fixtureCase[source];
      if (isObject(value)) {
        count += 1;
      } else if (Array.isArray(value)) {
        count += value.reduce((subtotal: number, entry: unknown) =>
          subtotal +
          (isObject(entry) && Array.isArray(entry["values"])
            ? entry["values"].length
            : 1), 0);
      } else {
        return undefined;
      }
    }
    return count;
  }
  if (mode === "primary-plus-frozen-counterpart") {
    const primary = fixtureCase["mutations"];
    const counterpart = fixtureCase["frozenCounterpart"];
    if (
      !Array.isArray(primary) ||
      primary.length === 0 ||
      !isObject(counterpart) ||
      !Array.isArray(counterpart["mutations"]) ||
      counterpart["mutations"].length === 0 ||
      !jsonEqual(expansion["order"], ["mutations", "frozenCounterpart"])
    ) {
      return undefined;
    }
    return 2;
  }
  if (mode === "primary-plus-invalid-sibling-counterpart") {
    const materialization = fixtureCase["materialization"];
    const counterpart = fixtureCase["invalidSiblingCounterpart"];
    if (
      typeof materialization !== "string" ||
      materialization.trim().length === 0 ||
      !isObject(counterpart) ||
      !Array.isArray(counterpart["mutations"]) ||
      counterpart["mutations"].length === 0 ||
      !jsonEqual(expansion["order"], [
        "materialization",
        "invalidSiblingCounterpart",
      ])
    ) {
      return undefined;
    }
    return 2;
  }
  if (mode === "field-branch-boundary") {
    const fields = fixtureCase["fields"];
    const branchOrder = expansion["branchOrder"];
    const boundaries = expansion["boundaryOrder"];
    if (!Array.isArray(fields) || !isObject(branchOrder) || !Array.isArray(boundaries)) {
      return undefined;
    }
    let count = 0;
    for (const field of fields) {
      if (!isObject(field)) return undefined;
      const branch = typeof field["branch"] === "string"
        ? field["branch"]
        : "absent";
      const activations = branchOrder[branch];
      if (!Array.isArray(activations)) return undefined;
      const activationProtocol = shape["activationProtocol"];
      if (
        !isObject(activationProtocol) ||
        activations.some(
          (activation: unknown) =>
            activation !== "no activation" &&
            (typeof activation !== "string" ||
              !Object.prototype.hasOwnProperty.call(
                activationProtocol,
                activation,
              )),
        )
      ) {
        finding(
          findings,
          "F2_ACTIVATION_REFERENCE",
          `${path}.cellExpansion.branchOrder.${branch}`,
          "Every branch-order entry must be the no-activation sentinel or a reviewed activation.",
        );
      }
      count += activations.length * boundaries.length;
    }
    return count;
  }
  if (
    mode === "group-target-value" ||
    mode === "group-target-value-plus-explicit-co-diagnostics"
  ) {
    const groups = fixtureCase["cellGroups"];
    const targets = fixtureCase["freeTextTargets"];
    if (!Array.isArray(groups) || !Array.isArray(targets)) return undefined;
    let count = 0;
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group["values"])) return undefined;
      const targetCount = group["targetIds"] === "all freeTextTargets"
        ? targets.length
        : Array.isArray(group["targetIds"])
          ? group["targetIds"].length
          : undefined;
      if (targetCount === undefined) return undefined;
      count += targetCount * group["values"].length;
    }
    if (mode === "group-target-value-plus-explicit-co-diagnostics") {
      const coDiagnostics = fixtureCase["consumerCoDiagnosticCells"];
      if (!Array.isArray(coDiagnostics)) return undefined;
      if (expansion["consumerCoDiagnosticCellCount"] !== coDiagnostics.length) {
        finding(
          findings,
          "F2_CELL_EXPANSION",
          `${path}.cellExpansion.consumerCoDiagnosticCellCount`,
          "Declared consumer co-diagnostic count must match its exact source cells.",
        );
      }
      count += coDiagnostics.length;
    }
    return count;
  }
  if (mode === "ordered-time-cells") {
    const cells = fixtureCase["cells"];
    const precedence = fixtureCase["precedenceCells"];
    const aggregate = fixtureCase["aggregateCells"];
    const denominators = isObject(fixtureCase["acceptedDenominatorCell"])
      ? fixtureCase["acceptedDenominatorCell"]["values"]
      : undefined;
    const expectedDurationTargets = fixtureCase["expectedDurationConsumerTargets"];
    const expectedDurationCells = fixtureCase["expectedDurationBeatCells"];
    if (!Array.isArray(cells) || !Array.isArray(aggregate) || !Array.isArray(denominators)) {
      return undefined;
    }
    const expectedDurationCount =
      Array.isArray(expectedDurationTargets) && Array.isArray(expectedDurationCells)
        ? expectedDurationTargets.length * expectedDurationCells.length
        : 0;
    const precedenceCount = Array.isArray(precedence) ? precedence.length : 0;
    for (const [key, expected] of [
      ["ordinaryCellCount", cells.length],
      ["precedenceCellCount", precedenceCount],
      ["aggregateCellCount", aggregate.length],
      ["denominatorCellCount", denominators.length],
      ["expectedDurationConsumerCellCount", expectedDurationCount],
    ] as const) {
      if (
        (key === "precedenceCellCount" ||
          key === "expectedDurationConsumerCellCount") &&
        expansion[key] === undefined
      ) {
        continue;
      }
      if (expansion[key] !== expected) {
        finding(
          findings,
          "F2_CELL_EXPANSION",
          `${path}.cellExpansion.${key}`,
          "Declared subgroup count does not match its source.",
        );
      }
    }
    return cells.length + precedenceCount + aggregate.length + denominators.length + expectedDurationCount;
  }
  if (mode === "ordered-expansion-groups" || mode === "ordered-value-groups") {
    const groups = expansion["groups"];
    if (!Array.isArray(groups)) return undefined;
    if (
      Array.isArray(expansion["groupOrder"]) &&
      !jsonEqual(
        expansion["groupOrder"],
        groups.map((group: unknown) =>
          isObject(group) ? group["id"] : undefined
        ),
      )
    ) {
      finding(
        findings,
        "F2_CELL_EXPANSION",
        `${path}.cellExpansion.groupOrder`,
        "Explicit group order must exactly name expansion groups.",
      );
    }
    let total = 0;
    for (let index = 0; index < groups.length; index += 1) {
      const group: unknown = groups[index];
      if (!isObject(group)) return undefined;
      const inferred = expansionGroupCount(
        group,
        fixtureCase,
        shape,
        adversarial,
      );
      if (inferred === undefined) return undefined;
      const declared = group["atomicCellCount"] ?? group["cellCount"];
      if (declared !== inferred) {
        finding(
          findings,
          "F2_CELL_EXPANSION",
          `${path}.cellExpansion.groups[${String(index)}]`,
          "Declared group count does not match its source axes.",
        );
      }
      total += inferred;
    }
    return total;
  }
  if (mode === "target-probe-cartesian" || mode === "target-value-cartesian") {
    const axes = strings(expansion["axisOrderOuterToInner"]);
    if (axes.length === 0) return undefined;
    let product = 1;
    for (const axis of axes) {
      const count = arraySourceCount(axis, fixtureCase, shape, adversarial);
      if (count === undefined) return undefined;
      product *= count;
    }
    return product;
  }
  finding(
    findings,
    "F2_CELL_EXPANSION",
    `${path}.cellExpansion.mode`,
    `Unknown cell expansion mode ${mode}.`,
  );
  return undefined;
}

function validateCellExpansions(
  cases: readonly FixtureCase[],
  shape: JsonObject | undefined,
  adversarial: JsonObject | undefined,
  manifest: JsonObject,
  findings: F2ContractFinding[],
): void {
  if (!shape || !adversarial) return;
  for (const fixtureCase of cases) {
    const expansion = fixtureCase.record["cellExpansion"];
    if (expansion === undefined) continue;
    const inferred = inferredExpansionCount(
      fixtureCase.record,
      shape,
      adversarial,
      manifest,
      findings,
      fixtureCase.path,
    );
    if (inferred === undefined || inferred <= 0) {
      finding(
        findings,
        "F2_CELL_EXPANSION",
        `${fixtureCase.path}.cellExpansion`,
        "A declared expansion must resolve to a nonzero ordered cell list.",
      );
      continue;
    }
    if (isObject(expansion) && expansion["atomicCellCount"] !== inferred) {
      finding(
        findings,
        "F2_CELL_EXPANSION",
        `${fixtureCase.path}.cellExpansion.atomicCellCount`,
        `Declared atomic count must equal ${String(inferred)}.`,
      );
    }
    if (
      isObject(expansion) &&
      expansion["mode"] === "independent-list" &&
      Array.isArray(expansion["order"]) &&
      typeof expansion["source"] === "string"
    ) {
      const source = fixtureCase.record[expansion["source"]];
      const ids = Array.isArray(source)
        ? source.map((cell: unknown) => isObject(cell) ? cell["id"] : undefined)
        : [];
      if (!jsonEqual(expansion["order"], ids)) {
        finding(
          findings,
          "F2_CELL_EXPANSION",
          `${fixtureCase.path}.cellExpansion.order`,
          "Independent-list order must exactly name source IDs.",
        );
      }
    }
  }
}

function defaultMaterializedCellCount(
  fixtureCase: FixtureCase,
  shape: JsonObject,
  adversarial: JsonObject,
  manifest: JsonObject,
): number | undefined {
  if (fixtureCase.record["cellExpansion"] !== undefined) {
    return inferredExpansionCount(
      fixtureCase.record,
      shape,
      adversarial,
      manifest,
      [],
      fixtureCase.path,
    );
  }
  if (fixtureCase.id === "F2-HOST-001") {
    return Array.isArray(fixtureCase.record["paths"]) &&
      Array.isArray(fixtureCase.record["descriptors"])
      ? fixtureCase.record["paths"].length * fixtureCase.record["descriptors"].length
      : undefined;
  }
  if (fixtureCase.id === "F2-LIMIT-011") {
    return Array.isArray(fixtureCase.record["collections"]) &&
      Array.isArray(fixtureCase.record["counts"]) &&
      isObject(fixtureCase.record["combinedOversizeCell"]) &&
      Array.isArray(fixtureCase.record["continuationCells"])
      ? fixtureCase.record["collections"].length * fixtureCase.record["counts"].length +
          1 +
          fixtureCase.record["continuationCells"].length
      : undefined;
  }
  let count = 0;
  let foundArray = false;
  for (const key of [
    "cells",
    "acceptedCells",
    "rejectedCells",
    "fields",
    "inputs",
    "values",
    "nodePaths",
  ] as const) {
    const records = fixtureCase.record[key];
    if (!Array.isArray(records)) continue;
    foundArray = true;
    count += records.reduce((subtotal: number, record: unknown) =>
      subtotal +
      (isObject(record) && Array.isArray(record["values"])
        ? record["values"].length
        : 1), 0);
  }
  if (foundArray) return count;
  if (
    fixtureCase.record["mutation"] !== undefined ||
    fixtureCase.record["mutations"] !== undefined ||
    fixtureCase.record["template"] !== undefined ||
    fixtureCase.record["materialization"] !== undefined ||
    fixtureCase.record["input"] !== undefined ||
    fixtureCase.record["inputDescriptor"] !== undefined
  ) {
    return 1;
  }
  return undefined;
}

function exactCounterRecord(
  value: unknown,
  keys: readonly string[],
  zeroOnly = false,
): boolean {
  return (
    isObject(value) &&
    jsonEqual(Object.keys(value), keys) &&
    keys.every((key) => {
      const count = value[key];
      return (
        typeof count === "number" &&
        Number.isSafeInteger(count) &&
        count >= 0 &&
        (!zeroOnly || count === 0)
      );
    })
  );
}

function validateWorkEvidenceContract(
  work: JsonObject | undefined,
  findings: F2ContractFinding[],
): void {
  if (!work) return;
  const exactEvidenceContract = {
    decoderEvidenceCounters: work["decoderEvidenceCounters"],
    harnessObservationCounters: work["harnessObservationCounters"],
    counterPolicy: work["counterPolicy"],
    zeroDecoderEvidence: work["zeroDecoderEvidence"],
    counterGoldenCells: work["counterGoldenCells"],
    counterGoldenMaterialization: work["counterGoldenMaterialization"],
    expected: work["expected"],
  };
  if (
    semanticSha256(exactEvidenceContract) !==
    EXPECTED_WORK_EVIDENCE_CONTRACT_SHA256
  ) {
    finding(
      findings,
      "F2_COUNTER_GOLDEN",
      "adversarial-cases.json:F2-WORK-001",
      "Counter partitions, policy, zero record, three numeric goldens, materialization, and expected obligations drifted from the exact reviewed evidence contract.",
    );
  }
  const decoderEvidenceCounters = work["decoderEvidenceCounters"];
  const harnessObservationCounters = work["harnessObservationCounters"];
  if (
    !jsonEqual(
      decoderEvidenceCounters,
      EXPECTED_DECODER_EVIDENCE_COUNTERS,
    ) ||
    !jsonEqual(
      harnessObservationCounters,
      EXPECTED_HARNESS_OBSERVATION_COUNTERS,
    )
  ) {
    finding(
      findings,
      "F2_COUNTER_PARTITION",
      "adversarial-cases.json:F2-WORK-001",
      "The exact 28 decoder-evidence counters followed by seven harness-observation counters must partition requiredCounters.",
    );
  }

  const policy = work["counterPolicy"];
  if (
    !isObject(policy) ||
    !jsonEqual(Object.keys(policy), [
      "type",
      "decoderEvidenceReset",
      "hiddenMutableDecoderState",
      "privateSeamResult",
      "harnessMerge",
      "repeat",
      "privateSeamFreshness",
      "fixtureWorkExcluded",
      "reflectionSnapshot",
    ]) ||
    policy["type"] !== "nonnegative safe integer" ||
    policy["hiddenMutableDecoderState"] !== false ||
    policy["fixtureWorkExcluded"] !== true ||
    [
      "decoderEvidenceReset",
      "privateSeamResult",
      "harnessMerge",
      "repeat",
      "privateSeamFreshness",
      "reflectionSnapshot",
    ].some(
      (key) =>
        typeof policy[key] !== "string" || policy[key].trim().length === 0,
    )
  ) {
    finding(
      findings,
      "F2_COUNTER_POLICY",
      "adversarial-cases.json:F2-WORK-001.counterPolicy",
      "Evidence calls require local reset, no hidden state, frozen seam results, ordered harness merge, repeat equality, freshness, and one reflection snapshot per reached container.",
    );
  }

  if (
    !exactCounterRecord(
      work["zeroDecoderEvidence"],
      EXPECTED_DECODER_EVIDENCE_COUNTERS,
      true,
    )
  ) {
    finding(
      findings,
      "F2_COUNTER_GOLDEN",
      "adversarial-cases.json:F2-WORK-001.zeroDecoderEvidence",
      "zeroDecoderEvidence must be the exact ordered 28-key all-zero decoder record.",
    );
  }

  const goldens = work["counterGoldenCells"];
  const goldenIds = Array.isArray(goldens)
    ? goldens.map((golden: unknown) =>
        isObject(golden) ? golden["id"] : undefined
      )
    : [];
  if (
    !Array.isArray(goldens) ||
    !jsonEqual(goldenIds, [
      "representative-shape",
      "byte-max-plus-one",
      "byte-invalid-negative",
    ])
  ) {
    finding(
      findings,
      "F2_COUNTER_GOLDEN",
      "adversarial-cases.json:F2-WORK-001.counterGoldenCells",
      "Exactly three ordered counter goldens are required.",
    );
  } else {
    goldens.forEach((golden: unknown, index: number) => {
      if (!isObject(golden)) return;
      if (
        !exactCounterRecord(
          golden["expectedHarnessObservations"],
          EXPECTED_HARNESS_OBSERVATION_COUNTERS,
          true,
        )
      ) {
        finding(
          findings,
          "F2_COUNTER_GOLDEN",
          `adversarial-cases.json:F2-WORK-001.counterGoldenCells[${String(index)}].expectedHarnessObservations`,
          "Every golden requires the exact ordered seven-key all-zero harness observation.",
        );
      }
    });
    const representative: unknown = goldens[0];
    if (
      !isObject(representative) ||
      representative["operation"] !== "decodeDocumentShapeWithEvidence" ||
      representative["template"] !==
        "shape-cases.json:templates.representativeDocument" ||
      !exactCounterRecord(
        representative["expectedDecoderEvidence"],
        EXPECTED_DECODER_EVIDENCE_COUNTERS,
      )
    ) {
      finding(
        findings,
        "F2_COUNTER_GOLDEN",
        "adversarial-cases.json:F2-WORK-001.counterGoldenCells[0]",
        "The representative-shape golden requires a complete ordered 28-counter decoder-evidence record.",
      );
    }
    for (let index = 1; index < goldens.length; index += 1) {
      const golden: unknown = goldens[index];
      if (
        !isObject(golden) ||
        golden["operation"] !==
          "preflightDocumentImportBytesWithEvidence" ||
        golden["expectedDecoderEvidenceBase"] !== "zeroDecoderEvidence" ||
        !isObject(golden["expectedDecoderEvidenceOverrides"]) ||
        Object.keys(golden["expectedDecoderEvidenceOverrides"]).some(
          (key) =>
            !EXPECTED_DECODER_EVIDENCE_COUNTERS.some(
              (counter) => counter === key,
            ),
        ) ||
        Object.values(golden["expectedDecoderEvidenceOverrides"]).some(
          (count) =>
            typeof count !== "number" ||
            !Number.isSafeInteger(count) ||
            count < 0,
        )
      ) {
        finding(
          findings,
          "F2_COUNTER_GOLDEN",
          `adversarial-cases.json:F2-WORK-001.counterGoldenCells[${String(index)}]`,
          "Byte-preflight goldens must apply nonnegative safe-integer decoder-evidence overrides to zeroDecoderEvidence.",
        );
      }
    }
  }

  const expected = work["expected"];
  if (
    !isObject(expected) ||
    expected["decoderEvidenceCounterCount"] !== 28 ||
    expected["harnessObservationCounterCount"] !== 7 ||
    expected["requiredCounterCount"] !== 35 ||
    expected["counterGoldenCellCount"] !== 3 ||
    expected["successfulShapePersistedDataRoundTripEveryCell"] !== true ||
    typeof work["counterGoldenMaterialization"] !== "string" ||
    work["counterGoldenMaterialization"].trim().length === 0
  ) {
    finding(
      findings,
      "F2_COUNTER_GOLDEN",
      "adversarial-cases.json:F2-WORK-001.expected",
      "WORK must publish the exact counter partition sizes, three goldens, and successful persisted-data round-trip obligation.",
    );
  }
}

function validateSeededReplayProtocol(
  adversarial: JsonObject | undefined,
  cases: readonly FixtureCase[],
  shape: JsonObject | undefined,
  manifest: JsonObject,
  findings: F2ContractFinding[],
): void {
  if (!adversarial || !shape) return;
  const replay = adversarial["seededReplayProtocol"];
  if (!isObject(replay)) {
    finding(
      findings,
      "F2_REPLAY_PROTOCOL",
      "adversarial-cases.json:$.seededReplayProtocol",
      "Seeded replay requires a structured protocol.",
    );
    return;
  }
  if (
    !jsonEqual(Object.keys(replay), EXPECTED_SEEDED_REPLAY_KEYS) ||
    replay["prng"] !== "xorshift32-v1" ||
    replay["cellIndexForbidden"] !== true
  ) {
    finding(
      findings,
      "F2_REPLAY_PROTOCOL",
      "adversarial-cases.json:$.seededReplayProtocol",
      "Replay keys, PRNG identity, or cell-index prohibition drifted.",
    );
  }
  if (semanticSha256(replay) !== EXPECTED_SEEDED_REPLAY_PROTOCOL_SHA256) {
    finding(
      findings,
      "F2_REPLAY_PROTOCOL",
      "adversarial-cases.json:$.seededReplayProtocol",
      "Seeded replay must retain the exact independently reviewed transition, schedule, materialization, observation, and digest protocol.",
    );
  }
  for (const key of EXPECTED_SEEDED_REPLAY_KEYS) {
    if (
      key !== "excludedCaseIds" &&
      key !== "cellIndexForbidden" &&
      (typeof replay[key] !== "string" || replay[key].trim().length === 0)
    ) {
      finding(
        findings,
        "F2_REPLAY_PROTOCOL",
        `adversarial-cases.json:$.seededReplayProtocol.${key}`,
        "Every replay phase requires a nonempty deterministic definition.",
      );
    }
  }
  const replayMarkers: Readonly<Record<string, readonly string[]>> = {
    transition: ["state<<13", "state>>>17", "state<<5", ">>>0"],
    selection: ["lexical order", "Fisher-Yates", "nextUint32%(i+1)"],
    expectationPolicy: ["never generate expected values"],
    caseMaterialization: ["explicit cellExpansion is exhaustive", "F2-HOST-001", "F2-LIMIT-011"],
    replay: [
      "Decode every cell twice through the public operation and twice through the matching private evidence seam",
      "four referentially fresh equivalent inputs",
      "public result to equal the private seam's result",
      "exact private evidence",
    ],
    caseObservation: ["{cells:[...]}", "{ok:true}", "{ok:false,errors:[...]}"],
    canonicalJson: ["UTF-16 code-unit order", "JSON.stringify", "UTF-8"],
    caseLine: ["U+0009 TAB", "U+000A LF", "SHA-256"],
    seedDigests: ["one digest per stable seed", "F2-WORK-001.campaign.seedIds"],
  };
  for (const [key, markers] of Object.entries(replayMarkers)) {
    const value = replay[key];
    if (
      typeof value !== "string" ||
      markers.some((marker) => !value.includes(marker))
    ) {
      finding(
        findings,
        "F2_REPLAY_PROTOCOL",
        `adversarial-cases.json:$.seededReplayProtocol.${key}`,
        "Replay definition is missing a reviewed deterministic operation.",
      );
    }
  }
  const protocolWithoutFlag = Object.fromEntries(
    Object.entries(replay).filter(([key]) => key !== "cellIndexForbidden"),
  );
  if (JSON.stringify(protocolWithoutFlag).includes("cellIndex")) {
    finding(
      findings,
      "F2_REPLAY_PROTOCOL",
      "adversarial-cases.json:$.seededReplayProtocol",
      "Cell indices must not enter replay scheduling, observations, or digest lines.",
    );
  }

  const exclusions = replay["excludedCaseIds"];
  const expectedExclusions = [
    {
      id: "F2-LIMIT-003",
      reason: "internal depth-preflight near-miss intentionally has no asserted public shape result",
    },
  ];
  if (!jsonEqual(exclusions, expectedExclusions)) {
    finding(
      findings,
      "F2_REPLAY_EXCLUSION",
      "adversarial-cases.json:$.seededReplayProtocol.excludedCaseIds",
      "Replay exclusions require the one reviewed case and reason.",
    );
  }
  const exclusionIds = Array.isArray(exclusions)
    ? exclusions.flatMap((item: unknown) =>
        isObject(item) && typeof item["id"] === "string" ? [item["id"]] : []
      )
    : [];
  const caseById = new Map(cases.map((fixtureCase) => [fixtureCase.id, fixtureCase]));
  for (const id of exclusionIds) {
    if (!caseById.has(id)) {
      finding(
        findings,
        "F2_REPLAY_EXCLUSION",
        "adversarial-cases.json:$.seededReplayProtocol.excludedCaseIds",
        `Unknown excluded case ${id}.`,
      );
    }
  }

  const seeds = adversarial["stableSeeds"];
  if (Array.isArray(seeds)) {
    for (let index = 0; index < seeds.length; index += 1) {
      const seed: unknown = seeds[index];
      if (!isObject(seed)) continue;
      const prefixes = strings(seed["casePrefixes"]);
      const scheduled = cases.filter(
        (fixtureCase) =>
          prefixes.some((prefix) => fixtureCase.id.startsWith(prefix)) &&
          !exclusionIds.includes(fixtureCase.id),
      );
      if (scheduled.length === 0) {
        finding(
          findings,
          "F2_REPLAY_SCHEDULE",
          `adversarial-cases.json:$.stableSeeds[${String(index)}].casePrefixes`,
          "Every seed must schedule at least one non-excluded case.",
        );
      }
      for (const fixtureCase of scheduled) {
        const count = defaultMaterializedCellCount(
          fixtureCase,
          shape,
          adversarial,
          manifest,
        );
        if (count === undefined || count <= 0) {
          finding(
            findings,
            "F2_REPLAY_SCHEDULE",
            fixtureCase.path,
            `${fixtureCase.id} does not resolve to a nonzero cell list.`,
          );
        }
      }
    }
  }

  const work = caseById.get("F2-WORK-001")?.record;
  validateWorkEvidenceContract(work, findings);
  const campaign = work && isObject(work["campaign"])
    ? work["campaign"]
    : undefined;
  const seedIds = Array.isArray(seeds)
    ? seeds.map((seed: unknown) => isObject(seed) ? seed["id"] : undefined)
    : [];
  if (
    !work ||
    work["generator"] !== "seededReplayProtocol" ||
    !campaign ||
    !jsonEqual(campaign["seedIds"], seedIds) ||
    campaign["decodesPerMaterializedCell"] !== 2 ||
    campaign["seedDigests"] !== seedIds.length ||
    !jsonEqual(campaign["excludedCaseIds"], exclusionIds) ||
    campaign["mutationControlsDefined"] !==
      (Array.isArray(adversarial["mutationControls"])
        ? adversarial["mutationControls"].length
        : -1) ||
    campaign["generatedPermutations"] !== 0 ||
    campaign["generatedAliasGraphs"] !== 0
  ) {
    finding(
      findings,
      "F2_REPLAY_CAMPAIGN",
      "adversarial-cases.json:F2-WORK-001.campaign",
      "Property campaign identity, seed order, exclusions, decode count, or generated-work ban drifted.",
    );
  }
  if (!work || !jsonEqual(work["requiredCounters"], EXPECTED_EVIDENCE_COUNTERS)) {
    finding(
      findings,
      "F2_COUNTER_INVENTORY",
      "adversarial-cases.json:F2-WORK-001.requiredCounters",
      "Evidence counters must retain the exact reviewed IDs and order.",
    );
  }
  const counterSemantics = work?.["counterSemantics"];
  if (
    !isObject(counterSemantics) ||
    !jsonEqual(Object.keys(counterSemantics), EXPECTED_EVIDENCE_COUNTERS) ||
    semanticSha256(counterSemantics) !== EXPECTED_COUNTER_SEMANTICS_SHA256 ||
    Object.values(counterSemantics).some(
      (value) => typeof value !== "string" || value.trim().length === 0,
    )
  ) {
    finding(
      findings,
      "F2_COUNTER_SEMANTICS",
      "adversarial-cases.json:F2-WORK-001.counterSemantics",
      "Counter semantics must exactly retain every reviewed key, order, and operational definition.",
    );
  }
}

function validateStaticObligations(
  adversarialCases: readonly FixtureCase[],
  findings: F2ContractFinding[],
): void {
  const matches = adversarialCases.filter(
    (fixtureCase) => fixtureCase.id === "F2-STATIC-001",
  );
  const fixtureCase = matches[0];
  if (
    fixtureCase === undefined ||
    matches.length !== 1 ||
    fixtureCase.record["kind"] !==
      "decoder-publication-and-import-boundary-static-proof" ||
    !jsonEqual(fixtureCase.record["expected"], EXPECTED_STATIC_OBLIGATIONS)
  ) {
    finding(
      findings,
      "F2_STATIC_OBLIGATIONS",
      "adversarial-cases.json:F2-STATIC-001",
      "Static proof must retain exact runtime exports, operations value identity/order/freezing/re-exports, private typed evidence seams and key split, immutable evidence results, forbidden exports/imports/casts, success type, and sole cast owner.",
    );
  }
}

function validateSeedsAndMutations(
  adversarial: JsonObject | undefined,
  caseIds: ReadonlySet<string>,
  findings: F2ContractFinding[],
): Readonly<{ seeds: number; mutations: number }> {
  if (!adversarial) return { seeds: 0, mutations: 0 };
  const rawSeeds = adversarial["stableSeeds"];
  const rawMutations = adversarial["mutationControls"];
  if (!Array.isArray(rawSeeds)) {
    finding(findings, "F2_SEEDS", "adversarial-cases.json:$.stableSeeds", "Stable seeds must be an array.");
  } else {
    const actual = new Map<string, number>();
    rawSeeds.forEach((raw: unknown, index: number) => {
      if (
        isObject(raw) &&
        typeof raw["id"] === "string" &&
        typeof raw["value"] === "number" &&
        typeof raw["hex"] === "string" &&
        typeof raw["purpose"] === "string" &&
        raw["purpose"].trim().length > 0 &&
        uniqueStrings(raw["casePrefixes"]).length > 0
      ) {
        actual.set(raw["id"], raw["value"]);
        const expectedHex = `0x${raw["value"].toString(16).toUpperCase().padStart(8, "0")}`;
        if (raw["hex"] !== expectedHex) {
          finding(findings, "F2_SEED_SHAPE", `adversarial-cases.json:$.stableSeeds[${String(index)}].hex`, "Seed hex must exactly encode its unsigned value.");
        }
        for (const prefix of uniqueStrings(raw["casePrefixes"])) {
          if (![...caseIds].some((caseId) => caseId.startsWith(prefix))) {
            finding(findings, "F2_SEED_SHAPE", `adversarial-cases.json:$.stableSeeds[${String(index)}].casePrefixes`, `No case matches seed prefix ${prefix}.`);
          }
        }
      } else finding(findings, "F2_SEED_SHAPE", `adversarial-cases.json:$.stableSeeds[${String(index)}]`, "Seed requires exact ID/value/hex/purpose/case-prefix fields.");
    });
    if (rawSeeds.length !== actual.size || !jsonEqual([...actual], [...EXPECTED_SEEDS])) finding(findings, "F2_SEED_INVENTORY", "adversarial-cases.json:$.stableSeeds", "Stable seed IDs, values, uniqueness, or order drifted.");
  }
  if (!Array.isArray(rawMutations)) {
    finding(findings, "F2_MUTATIONS", "adversarial-cases.json:$.mutationControls", "Mutation controls must be an array.");
  } else {
    const mutationLedger = rawMutations.map((raw: unknown) =>
      isObject(raw)
        ? {
            id: raw["id"],
            owner: raw["owner"],
            fault: raw["fault"],
            caseIds: raw["caseIds"],
          }
        : raw
    );
    if (semanticSha256(mutationLedger) !== EXPECTED_MUTATION_LEDGER_SHA256) {
      finding(
        findings,
        "F2_MUTATION_LEDGER",
        "adversarial-cases.json:$.mutationControls",
        "Mutation IDs, owners, fault definitions, and exact killer-case mappings drifted from the independently reviewed ledger.",
      );
    }
    const expectedIds = Array.from({ length: 244 }, (_, index) => `F2-MUT-${String(index + 1).padStart(3, "0")}`);
    const actualIds = rawMutations.map((raw: unknown) => isObject(raw) ? raw["id"] : undefined);
    const mappedCaseIds = new Set<string>();
    let f2Owners = 0;
    let e0Owners = 0;
    for (let index = 0; index < rawMutations.length; index += 1) {
      const raw: unknown = rawMutations[index];
      if (!isObject(raw)) continue;
      if (raw["owner"] === "F2") f2Owners += 1;
      else if (raw["owner"] === "E0") e0Owners += 1;
      else finding(findings, "F2_MUTATION_INVENTORY", `adversarial-cases.json:$.mutationControls[${String(index)}].owner`, "Mutation owner must be F2 or E0.");
      const mappedCases = uniqueStrings(raw["caseIds"]);
      if (mappedCases.length === 0) {
        finding(findings, "F2_MUTATION_INVENTORY", `adversarial-cases.json:$.mutationControls[${String(index)}].caseIds`, "Mutation requires unique killer/owner case IDs.");
      }
      for (const caseId of mappedCases) {
        if (!caseIds.has(caseId)) {
          finding(findings, "F2_MUTATION_CASE_UNKNOWN", `adversarial-cases.json:$.mutationControls[${String(index)}].caseIds`, `Unknown mapped case ${caseId}.`);
        } else {
          mappedCaseIds.add(caseId);
        }
      }
    }
    const unmappedCaseIds = [...caseIds].filter(
      (caseId) =>
        caseId !== "F2-MUTATION-001" && !mappedCaseIds.has(caseId),
    );
    if (unmappedCaseIds.length > 0) {
      finding(
        findings,
        "F2_MUTATION_CASE_COVERAGE",
        "adversarial-cases.json:$.mutationControls",
        `Every executable case except the mutation-summary case requires a killer mapping; unmapped: ${unmappedCaseIds.join(", ")}.`,
      );
    }
    if (!jsonEqual(actualIds, expectedIds) || rawMutations.some((raw: unknown) => !isObject(raw) || typeof raw["fault"] !== "string" || raw["fault"].trim().length === 0) || f2Owners !== 242 || e0Owners !== 2) {
      finding(findings, "F2_MUTATION_INVENTORY", "adversarial-cases.json:$.mutationControls", "Exactly 244 named ordered mutation controls are required: 242 F2 and 2 E0.");
    }
  }
  const rawCases = adversarial["cases"];
  const mutationSummary: unknown = Array.isArray(rawCases)
    ? rawCases.find(
        (raw: unknown) => isObject(raw) && raw["id"] === "F2-MUTATION-001",
      )
    : undefined;
  if (
    !isObject(mutationSummary) ||
    !jsonEqual(mutationSummary["expected"], EXPECTED_MUTATION_SUMMARY)
  ) {
    finding(
      findings,
      "F2_MUTATION_SUMMARY",
      "adversarial-cases.json:F2-MUTATION-001.expected",
      "Mutation summary must retain the exact 244-control, 242-F2, 2-E0 ownership handoff.",
    );
  }
  return {
    seeds: Array.isArray(rawSeeds) ? rawSeeds.length : 0,
    mutations: Array.isArray(rawMutations) ? rawMutations.length : 0,
  };
}

export async function validateF2Contract(
  fixtureRoot = fileURLToPath(new URL("../tests/fixtures/decoder", import.meta.url)),
): Promise<F2ContractValidationReport> {
  const root = resolve(fixtureRoot);
  const findings: F2ContractFinding[] = [];
  let filenames: readonly string[] = [];
  try {
    filenames = (await readdir(root)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    finding(findings, "F2_FIXTURE_ROOT", basename(root), "Fixture root cannot be read.");
  }
  const expectedFilenames = ["f2-decoder-contract.json", ...EXPECTED_COMPANIONS.map(([name]) => name)].sort();
  if (!jsonEqual(filenames, expectedFilenames)) {
    finding(findings, "F2_FILE_INVENTORY", basename(root), "Reviewed JSON file inventory drifted.");
  }

  const parsedEntries = await Promise.all(expectedFilenames.map((name) => parseJson(root, name, findings)));
  const parsed = new Map(parsedEntries.filter((entry): entry is ParsedJson => entry !== undefined).map((entry) => [entry.filename, entry]));
  for (const [filename, expectedDigest] of Object.entries(
    EXPECTED_SEMANTIC_SNAPSHOT_DIGESTS.json,
  )) {
    const entry = parsed.get(filename);
    if (!entry) continue;
    const projection = filename === "f2-decoder-contract.json"
      ? Object.fromEntries(
          Object.entries(entry.root).filter(
            ([key]) => key !== "reviewedDigests",
          ),
        )
      : entry.root;
    if (semanticSha256(projection) !== expectedDigest) {
      finding(
        findings,
        "F2_SEMANTIC_SNAPSHOT",
        filename,
        "Parsed reviewed semantics drifted from the independent validator-owned snapshot.",
      );
    }
  }
  const manifest = parsed.get("f2-decoder-contract.json")?.root;
  const companionCount = EXPECTED_COMPANIONS.filter(([filename]) =>
    parsed.has(filename)
  ).length;
  if (!manifest) {
    return {
      schema: "changes.validation.f2-contract.v1",
      package: "F2",
      outcome: "fail",
      counts: { companions: companionCount, shapeCases: 0, adversarialCases: 0, totalCases: 0, traces: 0, authorities: 0, seeds: 0, mutationControls: 0, objectSchemas: 0 },
      findings: findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path)),
    };
  }

  for (const [key, expected] of Object.entries({ schema: "changes.fixtures.f2-decoder-contract.v1", contractVersion: "1.0.0", package: "F2", beadId: "jcpe-milestone-foundation-vc2.3.1", contractDocument: "docs/F2_DECODER_CONTRACT.md", description: "Independent structural-decoder authority for the bounded changes.progression.v2 wire shape." })) {
    if (manifest[key] !== expected) finding(findings, "F2_MANIFEST_IDENTITY", `f2-decoder-contract.json:$.${key}`, `Expected ${expected}.`);
  }
  if (!jsonEqual(Object.keys(manifest), [
    "schema",
    "contractVersion",
    "package",
    "beadId",
    "contractDocument",
    "description",
    "authorityPolicy",
    "publicSurface",
    "internalEvidenceSurface",
    "stageOwnership",
    "fixedLimits",
    "fixedInventories",
    "objectSchemas",
    "diagnostics",
    "termination",
    "companions",
    "reviewedDigests",
    "coverageSummary",
  ])) {
    finding(findings, "F2_MANIFEST_SURFACE", "f2-decoder-contract.json:$", "Manifest root keys and order must match the reviewed surface.");
  }
  if (!jsonEqual(manifest["fixedLimits"], EXPECTED_LIMITS)) finding(findings, "F2_FIXED_LIMIT", "f2-decoder-contract.json:$.fixedLimits", "Fixed F2 limits drifted.");
  if (!jsonEqual(manifest["fixedInventories"], EXPECTED_INVENTORIES)) finding(findings, "F2_FIXED_INVENTORY", "f2-decoder-contract.json:$.fixedInventories", "Fixed F2 inventories drifted.");
  if (!jsonEqual(manifest["authorityPolicy"], EXPECTED_AUTHORITY_POLICY)) {
    finding(findings, "F2_AUTHORITY_POLICY", "f2-decoder-contract.json:$.authorityPolicy", "Production output and modules cannot author fixture expectations.");
  }
  const publicSurface = manifest["publicSurface"];
  if (!jsonEqual(publicSurface, EXPECTED_PUBLIC_SURFACE)) {
    finding(findings, "F2_PUBLIC_SURFACE", "f2-decoder-contract.json:$.publicSurface", "Public operation identity or result contract drifted.");
  }
  if (
    !jsonEqual(
      manifest["internalEvidenceSurface"],
      EXPECTED_INTERNAL_EVIDENCE_SURFACE,
    )
  ) {
    finding(
      findings,
      "F2_INTERNAL_EVIDENCE_SURFACE",
      "f2-decoder-contract.json:$.internalEvidenceSurface",
      "Private evidence seams, result identity, counter partition, non-export, or hidden-state prohibition drifted.",
    );
  }
  if (!jsonEqual(manifest["stageOwnership"], EXPECTED_STAGE_OWNERSHIP)) {
    finding(findings, "F2_STAGE_OWNERSHIP", "f2-decoder-contract.json:$.stageOwnership", "Package ownership boundaries drifted.");
  }
  if (!jsonEqual(manifest["diagnostics"], EXPECTED_DIAGNOSTICS)) {
    finding(findings, "F2_DIAGNOSTIC_CONTRACT", "f2-decoder-contract.json:$.diagnostics", "Diagnostic result/order contract drifted.");
  }
  if (!jsonEqual(manifest["termination"], EXPECTED_TERMINATION)) {
    finding(findings, "F2_TERMINATION_CONTRACT", "f2-decoder-contract.json:$.termination", "Termination and allocation boundary drifted.");
  }
  if (!jsonEqual(manifest["reviewedDigests"], EXPECTED_REVIEWED_DIGESTS)) {
    finding(findings, "F2_REVIEWED_DIGEST", "f2-decoder-contract.json:$.reviewedDigests", "Reviewed document/companion digest pins drifted.");
  }
  for (const [filename, expectedDigest] of Object.entries(
    EXPECTED_REVIEWED_DIGESTS.companionsSha256,
  )) {
    const actualDigest = parsed.get(filename)?.digest;
    if (actualDigest !== expectedDigest) {
      finding(findings, "F2_REVIEWED_DIGEST", filename, "Reviewed companion bytes do not match the locked SHA-256.");
    }
  }
  try {
    const contractSource = await readFile(
      fileURLToPath(new URL("../docs/F2_DECODER_CONTRACT.md", import.meta.url)),
      "utf8",
    );
    const contractDigest = createHash("sha256")
      .update(contractSource)
      .digest("hex");
    if (contractDigest !== EXPECTED_REVIEWED_DIGESTS.contractDocumentSha256) {
      finding(findings, "F2_REVIEWED_DIGEST", "docs/F2_DECODER_CONTRACT.md", "Contract document bytes do not match the locked SHA-256.");
    }
    const normalizedContractDigest = createHash("sha256")
      .update(contractSource.replace(/\r\n?/gu, "\n"))
      .digest("hex");
    if (
      normalizedContractDigest !==
      EXPECTED_SEMANTIC_SNAPSHOT_DIGESTS.contractDocumentNormalizedSha256
    ) {
      finding(
        findings,
        "F2_SEMANTIC_SNAPSHOT",
        "docs/F2_DECODER_CONTRACT.md",
        "Contract semantics drifted from the independent validator-owned normalized-byte snapshot.",
      );
    }
  } catch {
    finding(findings, "F2_REVIEWED_DIGEST", "docs/F2_DECODER_CONTRACT.md", "Contract document cannot be read.");
    finding(findings, "F2_SEMANTIC_SNAPSHOT", "docs/F2_DECODER_CONTRACT.md", "Contract document cannot be read for semantic snapshot validation.");
  }

  const companions = manifest["companions"];
  if (!Array.isArray(companions) || companions.length !== EXPECTED_COMPANIONS.length) {
    finding(findings, "F2_COMPANION_INVENTORY", "f2-decoder-contract.json:$.companions", "Exactly four companion declarations are required.");
  } else {
    if (!jsonEqual(companions, EXPECTED_COMPANION_DECLARATIONS)) finding(findings, "F2_COMPANION_INVENTORY", "f2-decoder-contract.json:$.companions", "Exact companion records, paths, schemas, collections, or order drifted.");
  }
  for (const [filename, schema] of EXPECTED_COMPANIONS) {
    const entry = parsed.get(filename);
    if (entry?.root["schema"] !== schema) finding(findings, "F2_COMPANION_SCHEMA", `${filename}:$.schema`, `Expected ${schema}.`);
  }

  const shapeParsed = parsed.get("shape-cases.json");
  const adversarialParsed = parsed.get("adversarial-cases.json");
  const shapeCases = casesFrom(shapeParsed, findings);
  const adversarialCases = casesFrom(adversarialParsed, findings);
  const allCases = [...shapeCases, ...adversarialCases];
  const caseIds = new Set<string>();
  const observedIssueCodes = new Set<string>();
  for (const fixtureCase of allCases) {
    if (caseIds.has(fixtureCase.id)) finding(findings, "F2_CASE_ID_DUPLICATE", `${fixtureCase.path}.id`, "Case ID must be globally unique.");
    caseIds.add(fixtureCase.id);
    validateIssueCodes(fixtureCase.record, fixtureCase.path, findings);
    validateExpectedIssueArrays(fixtureCase.record, fixtureCase.path, findings);
    collectExpectedIssueCodes(fixtureCase.record, observedIssueCodes);
  }
  observedIssueCodes.delete("limit.import_bytes_exceeded");
  if (!jsonEqual(
    [...observedIssueCodes].sort(),
    [...F2_REVIEWED_DOCUMENT_SHAPE_ISSUE_CODES].sort(),
  )) {
    finding(findings, "F2_EXPECTED_ISSUE_COVERAGE", "shape-cases.json:$.cases", "Every public document-shape issue code must have an exact fixture oracle.");
  }

  const traceParsed = parsed.get("trace-ledger.json");
  const provenanceParsed = parsed.get("provenance-ledger.json");
  const traces = recordsById(traceParsed?.root, "trace-ledger.json", "traces", findings);
  const authorities = recordsById(provenanceParsed?.root, "provenance-ledger.json", "authorities", findings);
  if (!jsonEqual([...traces.keys()], EXPECTED_TRACE_IDS)) finding(findings, "F2_TRACE_INVENTORY", "trace-ledger.json:$.traces", "Trace inventory drifted.");
  if (!jsonEqual([...authorities.keys()], EXPECTED_AUTHORITY_IDS)) finding(findings, "F2_AUTHORITY_INVENTORY", "provenance-ledger.json:$.authorities", "Authority inventory drifted.");
  if (!provenanceParsed || provenanceParsed.root["productionOutputUsed"] !== false || provenanceParsed.root["expectedValuesGenerated"] !== false || typeof provenanceParsed.root["authoringStatement"] !== "string") {
    finding(findings, "F2_PROVENANCE_POLICY", "provenance-ledger.json", "Independent authoring policy is incomplete.");
  }
  validateReferences(allCases, traces, authorities, findings);
  const objectSchemas = validateObjectSchemas(manifest, findings);
  const materialization = validateMaterializationProtocols(
    shapeParsed?.root,
    adversarialParsed?.root,
    findings,
  );
  validateSchemaVariantTargets(
    shapeParsed?.root,
    manifest,
    materialization.representative,
    materialization.activationProtocol,
    materialization.branchFragments,
    findings,
  );
  validateReviewedSemanticInventories(
    shapeCases,
    adversarialCases,
    adversarialParsed?.root,
    findings,
  );
  validateTargetRegistries(
    shapeParsed?.root,
    adversarialParsed?.root,
    shapeCases,
    materialization.representative,
    materialization.activationProtocol,
    materialization.branchFragments,
    findings,
  );
  validateCellExpansions(
    allCases,
    shapeParsed?.root,
    adversarialParsed?.root,
    manifest,
    findings,
  );
  validateSeededReplayProtocol(
    adversarialParsed?.root,
    allCases,
    shapeParsed?.root,
    manifest,
    findings,
  );
  validateStaticObligations(adversarialCases, findings);
  const seedAndMutation = validateSeedsAndMutations(
    adversarialParsed?.root,
    caseIds,
    findings,
  );

  const actualCoverage = {
    companionFiles: companionCount,
    shapeCaseRecords: shapeCases.length,
    adversarialCaseRecords: adversarialCases.length,
    traceRecords: traces.size,
    authorityRecords: authorities.size,
    objectSchemaVariants: objectSchemas,
    stableSeeds: seedAndMutation.seeds,
    mutationControls: seedAndMutation.mutations,
  };
  if (!jsonEqual(manifest["coverageSummary"], actualCoverage)) finding(findings, "F2_COVERAGE_SUMMARY", "f2-decoder-contract.json:$.coverageSummary", "Coverage summary must equal computed inventory counts.");

  findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path) || left.message.localeCompare(right.message));
  return {
    schema: "changes.validation.f2-contract.v1",
    package: "F2",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      companions: companionCount,
      shapeCases: shapeCases.length,
      adversarialCases: adversarialCases.length,
      totalCases: allCases.length,
      traces: traces.size,
      authorities: authorities.size,
      seeds: seedAndMutation.seeds,
      mutationControls: seedAndMutation.mutations,
      objectSchemas,
    },
    findings,
  };
}

if (import.meta.main) {
  const report = await validateF2Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
