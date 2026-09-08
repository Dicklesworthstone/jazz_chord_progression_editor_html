import ts from "typescript";
import { resolve } from "node:path";
import { SEMANTIC_ENGINE_IDS, SEMANTIC_SURFACE_IDS, SEMANTIC_SURFACE_LIMITS,
  SEMANTIC_MUSICIAN_JOURNEY, SEMANTIC_DISPATCH_FAULTS,
  NATIVE_EXACT_CONTINUATION_REQUEST_SCHEMA, NATIVE_EXACT_CONTINUATION_RESPONSE_SCHEMA } from "../src/application/semantic-surface-contract";
import contract from "../tests/fixtures/semantic-surface-conformance/contract.json";
import laws from "../tests/fixtures/semantic-surface-conformance/law-cases.json";
import limits from "../tests/fixtures/semantic-surface-conformance/limit-cases.json";
import mutations from "../tests/fixtures/semantic-surface-conformance/mutation-controls.json";
import provenance from "../tests/fixtures/semantic-surface-conformance/provenance.json";
import traces from "../tests/fixtures/semantic-surface-conformance/trace-ledger.json";
import inventory from "../tests/fixtures/semantic-surface-conformance/operation-inventory.json";

export const semanticSurfacePacket = { contract, laws, limits, mutations, provenance, traces, inventory };
const schemas = {
  contract: "changes.fixtures.semantic-surface-contract.v1", laws: "changes.fixtures.semantic-surface-laws.v1",
  limits: "changes.fixtures.semantic-surface-limits.v1", mutations: "changes.fixtures.semantic-surface-mutations.v1",
  provenance: "changes.fixtures.semantic-surface-provenance.v1", traces: "changes.fixtures.semantic-surface-traces.v1",
  inventory: "changes.fixtures.semantic-operation-inventory.v1",
};
const root = resolve(import.meta.dirname, "..");
const letters = ["C", "D", "E", "F", "G", "A", "B"];
const major = [0, 2, 4, 5, 7, 9, 11];
const natural: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod = (n: number): number => ((n % 12) + 12) % 12;
function check(condition: boolean, code: string): asserts condition { if (!condition) throw new Error(`SS_${code}`); }
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value), "OBJECT"); return value as Record<string, unknown>;
}
function rows(value: unknown): unknown[] { check(Array.isArray(value), "ARRAY"); return value; }
function text(value: unknown): string { check(typeof value === "string", "STRING"); return value; }
function number(value: unknown): number { check(typeof value === "number" && Number.isFinite(value), "FINITE_NUMBER"); return value; }
function same(a: unknown, b: unknown, code: string): void { check(JSON.stringify(a) === JSON.stringify(b), code); }
function note(value: unknown) {
  const source = text(value), match = /^([A-G])(bb|##|b|#)?([0-9])?$/u.exec(source);
  check(match !== null && match[1] !== undefined, "NOTE_SPELLING");
  const letter = match[1], base = natural[letter]; check(base !== undefined, "NOTE_LETTER");
  const accidental = match[2] ?? "", alter = accidental.startsWith("b") ? -accidental.length : accidental.length;
  return { source, letter, pitch: mod(base + alter), midi: match[3] === undefined ? null : (Number(match[3]) + 1) * 12 + base + alter };
}
function rational(value: unknown): readonly [number, number] {
  const pair = rows(value); check(pair.length === 2, "RATIONAL_SHAPE");
  const n = number(pair[0]), d = number(pair[1]); check(Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(d) && d > 0, "RATIONAL_POSITIVE");
  return [n, d];
}
function sum(values: unknown): readonly [bigint, bigint] {
  let n = 0n, d = 1n;
  for (const value of rows(values)) { const [a, b] = rational(value); n = n * BigInt(b) + BigInt(a) * d; d *= BigInt(b); }
  return [n, d];
}

/** Independent packet arithmetic; no production parser/resolver/search is called. */
export function validateSemanticSurfacePacket(raw: unknown): readonly string[] {
  try {
    const packet = object(raw), c = object(packet["contract"]), law = object(packet["laws"]), limit = object(packet["limits"]),
      mutation = object(packet["mutations"]), source = object(packet["provenance"]), trace = object(packet["traces"]), operations = object(packet["inventory"]);
    same(Object.keys(packet).sort(), ["contract", "inventory", "laws", "limits", "mutations", "provenance", "traces"], "PACKET_KEYS");
    for (const [key, schema] of Object.entries(schemas)) check(object(packet[key])["schema"] === schema, "SCHEMA");
    same(c["companions"], ["law-cases.json", "limit-cases.json", "mutation-controls.json", "provenance.json", "trace-ledger.json", "operation-inventory.json"], "COMPANIONS");
    for (const [key, path] of Object.entries({
      publicContract: "src/application/semantic-surface-contract.ts", contractDocument: "docs/SEMANTIC_SURFACE_CONFORMANCE_CONTRACT.md",
      validator: "scripts/validate-semantic-surface-conformance-contract.ts", staticTest: "tests/static/semantic-surface-conformance-contract.test.ts",
      verifier: "scripts/verify-semantic-surface-conformance-evidence.ts", browserInventory: "tests/e2e/semantic-surface-conformance.spec.ts",
      report: "test-results/semantic-surface-conformance-evidence.json",
    })) check(c[key] === path, "OWNED_PATH");
    same(c["engines"], SEMANTIC_ENGINE_IDS, "ENGINE_INVENTORY"); same(c["surfaces"], SEMANTIC_SURFACE_IDS, "SURFACE_INVENTORY");
    same(c["limits"], SEMANTIC_SURFACE_LIMITS, "LIMIT_CONSTANTS"); same(c["journey"], SEMANTIC_MUSICIAN_JOURNEY, "JOURNEY");
    check(c["status"] === "specified-not-implemented", "SPEC_SCOPE");
    same(c["nativeParityEngines"], ["G2"], "NATIVE_SCOPE");
    same(c["nativeWorkbenchNonGoals"], ["G0", "G1", "G3", "G4", "G5", "G6", "G7", "G8", "G9"], "NATIVE_NON_GOALS");
    same(c["nativeSchemas"], { request: NATIVE_EXACT_CONTINUATION_REQUEST_SCHEMA, response: NATIVE_EXACT_CONTINUATION_RESPONSE_SCHEMA, v1CannotClaimExactSource: true }, "NATIVE_VERSION_BOUNDARY");
    same(c["releaseClaims"], { engineComplete: false, studioAdopted: false, nativeAppleExecuted: false, humanListened: false, aggregatePassed: false, deploymentApproved: false }, "NO_RELEASE_CLAIM");
    same(c["namedRealAdapters"], ["production-studio", "application-publication", "MessageChannel", "serialized-transport", "persistent-Web-Audio", "IndexedDB", "localStorage", "browser-download", "same-playback-plan-MIDI", "generated-native-bridge", "Apple-JavaScriptCore"], "ACTUAL_ADAPTERS");
    same(c["evidenceAuthorities"], { linuxBridgeReplay: "javascript-source-only", appleRuntime: "existing-DSR-Xcode-lane", humanListening: "explicit-human-observation", genericDiscoveryHarness: "upstream-protocol-only" }, "AUTHORITY_CLASSES");
    const boundaries = rows(limit["boundaries"]); same(boundaries.map(row => object(row)["key"]), Object.keys(SEMANTIC_SURFACE_LIMITS), "LIMIT_COVERAGE");
    for (const rawEdge of boundaries) {
      const edge = object(rawEdge), maximum = number(object(c["limits"])[text(edge["key"])]);
      check(edge["maximum"] === maximum && edge["at"] === maximum && edge["below"] === maximum - 1 && edge["above"] === maximum + 1, "LIMIT_EDGE");
    }
    same(limit["engineCeilings"], { G0: { sourceEvents: 256, paths: 5 }, G2: { contextEvents: 8, perProvider: 32, displayed: 16 },
      G3: { routeEvents: 8, outgoing: 64, states: 50000, trackedBytes: 67108864 }, G4: { slots: 16, perSlot: 128, states: 100000 }, G5: { depth: 3, width: 8, nodes: 128 } }, "UPSTREAM_CAPS");
    check(limit["wallTimeMayChangeMusic"] === false && limit["physicalHeapLimitClaim"] === false, "BOUNDED_SCOPE");
    same(limit["invalidNumericInputs"], [-1, 0.5, 9007199254740992], "INVALID_LIMIT_NUMBERS");
    check(limit["commonOverflow"] === "typed-refusal-or-explicit-bounded-partial-never-silent-repair", "OVERFLOW_SEMANTICS");
    same(law["naturalPitchClasses"], natural, "NATURAL_PITCHES"); same(law["majorScaleSteps"], major, "MAJOR_INTERVALS");
    check(law["expectedValuesGenerated"] === false && law["productionOutputUsed"] === false, "ORACLE_INDEPENDENCE");
    const chordRows = rows(law["chords"]), chords = new Map<string, Record<string, unknown>>();
    check(chordRows.length === 12, "CHORD_CASE_COUNT");
    for (const value of chordRows) {
      const chord = object(value), id = text(chord["id"]), tonic = note(chord["root"]), degrees = rows(chord["degrees"]),
        names = rows(chord["spellings"]), pcs = rows(chord["pitchClasses"]);
      check(!chords.has(id) && degrees.length === names.length && pcs.length === names.length, "CHORD_ALIGNMENT"); chords.set(id, chord);
      degrees.forEach((rawDegree, index) => {
        const degree = rows(rawDegree); check(degree.length === 2, "DEGREE_PAIR");
        const ordinal = number(degree[0]), alteration = number(degree[1]);
        check(Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= 13 && Number.isInteger(alteration) && Math.abs(alteration) <= 2, "DEGREE_BOUNDS");
        const expectedLetter = letters[(letters.indexOf(tonic.letter) + ordinal - 1) % 7], offset = major[(ordinal - 1) % 7];
        check(offset !== undefined, "DEGREE_OFFSET"); const spelled = note(names[index]);
        check(spelled.letter === expectedLetter && spelled.pitch === mod(tonic.pitch + offset + alteration) && pcs[index] === spelled.pitch, "INDEPENDENT_DEGREE_ARITHMETIC");
      });
    }
    const getChord = (id: unknown): Record<string, unknown> => { const chord = chords.get(text(id)); check(chord !== undefined, "UNKNOWN_CHORD"); return chord; };
    const containment = rows(law["containmentCases"]); check(containment.length === 4, "CONTAINMENT_CASE_COUNT");
    same(law["transpositionOffsets"], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "TRANSPOSE_COVERAGE");
    for (const value of containment) {
      const row = object(value), context = rows(row["chords"]).map(getChord), pitches = context.flatMap(chord => rows(chord["pitchClasses"]).map(number)),
        names = context.flatMap(chord => rows(chord["spellings"]).map(text));
      check(row["tonic"] === "C", "REFERENCE_TONIC");
      const matched = pitches.filter(pitch => major.includes(pitch)).length, spelled = names.filter(name => letters.includes(name)).length,
        scores = Array.from({ length: 12 }, (_, tonic) => pitches.filter(pitch => major.includes(mod(pitch - tonic))).length);
      check(row["toneOccurrences"] === pitches.length && row["pitchClassMatches"] === matched && row["spellingMatches"] === spelled, "CONTAINMENT_COUNTS");
      same(row["outsidePitchClasses"], [...new Set(pitches.filter(pitch => !major.includes(pitch)))].sort((a, b) => a - b), "CONTAINMENT_COUNTEREVIDENCE");
      same(row["bestMajorTonics"], scores.flatMap((score, tonic) => score === Math.max(...scores) ? [tonic] : []), "PLURAL_TIES");
      check(row["completePitchClassContainment"] === (matched === pitches.length) && row["completeSpelledContainment"] === (spelled === names.length), "CONTAINMENT_TRUTH");
      check(row["keyMayBePersisted"] === false, "INFERRED_KEY_NOT_PERSISTED");
      for (const offset of rows(law["transpositionOffsets"]).map(number)) {
        const moved = pitches.map(pitch => mod(pitch + offset));
        check(moved.filter(pitch => major.includes(mod(pitch - offset))).length === matched, "TRANSPOSE_CONTAINMENT");
        same(scores.map((score, tonic) => ({ score, tonic: mod(tonic + offset) })).sort((a, b) => a.tonic - b.tonic).map(row => row.score),
          Array.from({ length: 12 }, (_, tonic) => moved.filter(pitch => major.includes(mod(pitch - tonic))).length), "TRANSPOSE_TIES");
      }
    }
    const pair = object(law["spellingPair"]);
    same(getChord(pair["left"])["pitchClasses"], getChord(pair["right"])["pitchClasses"], "ENHARMONIC_PITCH_TWIN");
    check(JSON.stringify(getChord(pair["left"])["spellings"]) !== JSON.stringify(getChord(pair["right"])["spellings"]) &&
      pair["equalPitchClasses"] === true && pair["equalSpellings"] === false && pair["semanticIdentityEqual"] === false, "ENHARMONIC_IDENTITY");
    const selected = object(law["selectedAlteredPair"]);
    check(JSON.stringify(getChord(selected["left"])["pitchClasses"]) !== JSON.stringify(getChord(selected["right"])["pitchClasses"]) && selected["reuseCachedReading"] === false &&
      selected["mergeRealizations"] === false && selected["sameDocumentRevision"] === true && selected["missingSelection"] === "selected-realization-required", "SELECTED_REALIZATION");
    const barrier = object(law["barrier"]); same(barrier["events"], ["Dm7", "custom", "G7"], "BARRIER_SOURCE");
    check(barrier["barrierIndex"] === 1 && barrier["mayClaimAdjacentTwoFive"] === false && barrier["mayDropCustomSource"] === false && barrier["sourceUnchanged"] === true, "BARRIER_NOT_SKIPPED");
    const relations = rows(law["triadRelations"]); check(relations.length === 3, "PLR_CASES");
    for (const value of relations) {
      const relation = object(value); same(relation["source"], [0, 4, 7], "PLR_SOURCE");
      const expected = relation["operation"] === "P" ? [0, 3, 7] : relation["operation"] === "L" ? [4, 7, 11] : relation["operation"] === "R" ? [0, 4, 9] : null;
      check(expected !== null, "PLR_OPERATION"); same(relation["expected"], expected, "PLR_REPLACEMENT"); same(relation["common"], expected.filter(pitch => [0, 4, 7].includes(pitch)), "PLR_COMMON_TONES");
    }
    const voices = object(law["storedVoices"]), names = rows(voices["pitches"]);
    check(names.length === 16 && names[1] === "C4" && names[2] === "C4" && voices["allowSorting"] === false && voices["allowDeduplication"] === false && voices["frozenUsesSameLaw"] === true, "EXACT_VOICE_OWNERSHIP");
    same(voices["midi"], names.map(name => note(name).midi), "MIDI_NOTE_ARITHMETIC");
    const timeline = object(law["exactTimeline"]), [totalN, totalD] = rational(timeline["total"]);
    for (const lane of ["sourceDurations", "splitDurations"]) {
      const [n, d] = sum(timeline[lane]); check(n * BigInt(totalD) === BigInt(totalN) * d, "EXACT_TIME_SUM");
    }
    same(timeline["meter"], [7, 8], "ODD_METER"); same(timeline["pickup"], [3, 2], "PICKUP");
    check(BigInt(totalN) * 8n === 7n * 4n * BigInt(totalD) && timeline["allowRounding"] === false && timeline["allowInventedFourBeatEvents"] === false, "TIME_NOT_INVENTED");
    const transaction = object(law["transaction"]), revision = number(transaction["sourceRevision"]), history = number(transaction["historyBefore"]);
    check(transaction["afterPreviewRevision"] === revision && transaction["afterPreviewHistory"] === history && transaction["afterApplyRevision"] === revision + 1 &&
      transaction["afterApplyHistory"] === history + 1 && transaction["afterUndoRevision"] === revision + 2 && transaction["afterUndoHistory"] === history &&
      transaction["undoRestoresExactDocumentAndBookmarks"] === true && transaction["textOrMidiMayAdvanceCanonicalMarker"] === false, "TRANSACTION_LAW");
    check(operations["presenceIsCapabilityProof"] === false && operations["helperPresenceAddsFeatureCredit"] === false && operations["owningEngineProofMayBeReplacedByThisInventory"] === false, "DISPATCH_AUTHORITY");
    same(operations["requiredRuntimeEvidence"], ["actual-dispatch", "consumed-result", "independent-musical-diff", "source-identity", "versions", "actual-work", "stale-refusal", "resource-cleanup"], "ACTUAL_DISPATCH_EVIDENCE");
    const engines = rows(operations["engines"]); same(engines.map(row => object(row)["engine"]), SEMANTIC_ENGINE_IDS, "OPERATION_ENGINE_COVERAGE");
    same(rows(object(engines[0])["entries"]).flatMap(row => rows(object(row)["operations"])), ["deriveLiteralFacts", "analyzeChordInContext", "enumerateChordScaleOptions"], "H0_REAL_OPERATIONS");
    const allOperations = engines.flatMap(engine => rows(object(engine)["entries"]).flatMap(entry => rows(object(entry)["operations"]).map(text)));
    check(allOperations.length === 32 && new Set(allOperations).size === 32, "OPERATION_COUNT");
    const consumers = rows(operations["baselineConsumers"]);
    same(object(consumers[2])["operations"], ["generateContextualContinuations"], "NATIVE_BASELINE_ENGINE");
    const surfaces = rows(operations["baselineSurfaceConsumers"]);
    same(surfaces.map(row => object(row)["module"]), ["src/ui/App.tsx", "src/ui/studio/HarmonyLens.tsx", "src/ui/studio/ChordDetailPanel.tsx",
      "src/ui/studio/ChordInspector.tsx", "ios/Sources/JazzTheoryBridge.swift", "ios/Sources/JazzStudioStore.swift", "ios/Sources/FrankenJazzStudioView.swift"], "SURFACE_CONSUMERS");
    check(object(surfaces[4])["sourceRevisionReturnedByEngine"] === false && object(surfaces[5])["retainsLocalStaleOptionGuard"] === true, "NATIVE_LOCAL_REVISION_BOUNDARY");
    const bridge = object(trace["bridgeRequirements"]), download = object(trace["downloadRequirements"]), matrix = object(trace["browserMatrix"]);
    check(bridge["checkGeneratedSourceClosure"] === true && bridge["compareExactSourceBinding"] === true && bridge["sameVersionsAndPolicy"] === true &&
      bridge["v1MayInventExactAuthority"] === false && bridge["linuxReplayIsAppleExecution"] === false && bridge["automateAudibleSimulatorPlayback"] === false, "BRIDGE_AUTHORITY");
    check(download["actualBrowserDelivery"] === true && download["decodeCanonicalDocument"] === true && download["checkTextLosses"] === true && download["compareMidiEventsToSharedPlan"] === true &&
      download["headerOnlyIsProof"] === false && download["textOrMidiAdvancesCanonicalMarker"] === false, "REAL_DOWNLOAD_SEMANTICS");
    same(matrix["engines"], ["chromium", "firefox", "webkit"], "BROWSER_ENGINES"); same(matrix["touchEngines"], ["chromium", "webkit"], "TOUCH_ENGINES");
    check(matrix["retries"] === 0 && matrix["skips"] === 0 && matrix["forbidOnly"] === true && matrix["failOnFlaky"] === true && matrix["keyboard"] === true &&
      matrix["zoom"] === true && matrix["reducedMotion"] === true && matrix["productStylesRequired"] === true && matrix["fileAndHttp"] === true, "NATIVE_MATRIX_GATES");
    const traceRows = rows(trace["traces"]); check(traceRows.length === 7 && new Set(traceRows.map(row => object(row)["id"])).size === 7, "TRACE_COVERAGE");
    same(traceRows.map(row => object(row)["id"]), ["SS-LITERAL", "SS-CONTEXT", "SS-DISPATCH", "SS-LIFECYCLE", "SS-JOURNEY", "SS-NATIVE-SOURCE", "SS-NATIVE-APPLE"], "TRACE_IDS");
    for (const rawTrace of traceRows) {
      const row = object(rawTrace), owner = text(row["owner"]);
      check(/^(tests\/(unit|conformance|integration|property|e2e)\/semantic-surface-[a-z-]+\.(test|spec)\.ts|ios\/Tests\/FrankenJazzCoreTests\.swift)$/u.test(owner), "TRACE_OWNER");
      for (const key of ["laws", "required"]) {
        const entries = rows(row[key]); check(entries.length >= 2 && new Set(entries).size === entries.length && entries.every(value => typeof value === "string" && value.length > 0), "TRACE_OBSERVATIONS");
      }
    }
    check(matrix["desktopWidth"] === 1280 && matrix["phoneWidth"] === 390, "BROWSER_WIDTHS");
    same(trace["storageFaults"], ["denied", "quota", "corrupt-current", "valid-previous-copy", "localStorage-fallback", "replacement-during-read", "edit-during-write"], "STORAGE_FAULT_COVERAGE");
    same(trace["existingOwnersRetainGates"], ["U2", "U4", "U5", "U7", "Q0", "R0", "D0", "iOS-quality"], "EXISTING_OWNERS");
    const journey = traceRows.find(row => object(row)["id"] === "SS-JOURNEY"); check(journey !== undefined, "REAL_JOURNEY_TRACE");
    same(object(journey)["required"], SEMANTIC_MUSICIAN_JOURNEY, "REAL_JOURNEY_STAGES");
    same(rows(mutation["controls"]).map(row => object(row)["id"]), SEMANTIC_DISPATCH_FAULTS, "MUTATION_COVERAGE");
    check(mutation["sourceMutantsRequiredInBuildAndProof"] === true && mutation["fixtureMutationDoesNotProveProduction"] === true && mutation["baselineAndChangedSourceHashesRequired"] === true &&
      mutation["failureExitWithoutSemanticAssertionIsInsufficient"] === true, "MUTATION_AUTHORITY");
    check(source["productionOutputUsed"] === false && source["generatedExpectations"] === false && source["humanMusicianReviewClaimed"] === false, "PROVENANCE");
    check(source["authority"] === "definition-derived-independent-fixtures", "PROVENANCE_AUTHORITY");
    const references = rows(source["sources"]);
    check(references.length === 7 && new Set(references.map(value => object(value)["id"])).size === 7, "PROVENANCE_REFERENCES");
    for (const value of references) {
      const reference = object(value);
      check(text(reference["source"]).length > 0 && text(reference["scope"]).length > 0 && reference["judgmentBearing"] === false, "PROVENANCE_SCOPE");
    }
    same(source["corpusRules"], { eachOwningEngineRetainsIndependentLawProof: true, hashDoesNotApproveUpstreamMusic: true, noCopiedProductionExpectedResults: true, fullAtlasReviewRemainsD0: true }, "UPSTREAM_PROOF_BOUNDARIES");
    same(source["proofBoundaries"], { specificationOnly: true, sourceMutationRequiredLater: true, nativeAppleLaneRequired: true, humanListeningSeparate: true, noReleaseApproval: true }, "UPSTREAM_PROOF_BOUNDARIES");
    return [];
  } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
}

/** Structural source check only. The later proof must execute actual consumers. */
export async function validateSemanticSurfaceDeclarations(): Promise<readonly string[]> {
  const findings: string[] = [];
  for (const engine of inventory.engines) {
    if (!(await Bun.file(resolve(root, engine.fixtureRoot, "trace-ledger.json")).exists())) findings.push(`SS_ENGINE_TRACE_MISSING:${engine.engine}`);
    if (engine.operationsModule === null) continue;
    const source = ts.createSourceFile(engine.operationsModule, await Bun.file(resolve(root, engine.operationsModule)).text(), ts.ScriptTarget.Latest, true);
    const declared = source.statements.filter(ts.isInterfaceDeclaration).flatMap(declaration => declaration.members.filter(ts.isPropertySignature)
      .map(member => member.name).filter(ts.isIdentifier).map(name => name.text)).sort();
    const expected = engine.entries.flatMap(entry => entry.operations).sort();
    if (JSON.stringify(declared) !== JSON.stringify(expected)) findings.push(`SS_INTERFACE_INVENTORY:${engine.engine}`);
  }
  for (const path of [contract.publicContract, contract.contractDocument, contract.validator, contract.staticTest,
    ...inventory.baselineSurfaceConsumers.map(consumer => consumer.module),
    ...contract.companions.map(name => `tests/fixtures/semantic-surface-conformance/${name}`)]) {
    if (!(await Bun.file(resolve(root, path)).exists())) findings.push(`SS_PACKET_FILE_MISSING:${path}`);
  }
  for (const reference of provenance.sources) {
    if (reference.source.startsWith("git:")) continue; // Historical dispatch observation, not a current source lock.
    const [path] = reference.source.split("#");
    if (path === undefined || !(await Bun.file(resolve(root, path)).exists())) findings.push(`SS_PROVENANCE_FILE_MISSING:${reference.id}`);
  }
  return findings;
}

if (import.meta.main) {
  const findings = [...validateSemanticSurfacePacket(semanticSurfacePacket), ...await validateSemanticSurfaceDeclarations()];
  console.log(JSON.stringify({ schema: "changes.validation.semantic-surface.v1", outcome: findings.length === 0 ? "pass" : "fail",
    engineCount: 12, publicOperationCount: 32, additionalPublicHelpers: 2, compatibilityOperations: 4,
    independentChordCases: 12, containmentCases: 4, transpositionsPerCase: 12, limitEdges: 13, mutationControls: 16,
    traceOwners: 7, scope: "specification and independent arithmetic only", findings }, null, 2));
  process.exitCode = findings.length === 0 ? 0 : 1;
}
