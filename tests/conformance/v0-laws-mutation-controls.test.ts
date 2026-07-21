import { expect, test } from "bun:test";

import lawFixtureValue from "../fixtures/voicing/law-cases.json";
import mutationFixtureValue from "../fixtures/voicing/mutation-controls.json";

import { validateV0Contract } from "../../scripts/validate-v0-contract";
import {
  V0_MUTATION_MARKER,
  V0_MUTATION_PRODUCER,
  V0_MUTATION_SCHEMA,
  buildV0CaseBindings,
  buildV0RuntimePreimagePool,
  inspectV0MutationLinkPartition,
  signV0EvidenceObservation,
  v0EvidenceDigest,
} from "../../scripts/verify-v0-evidence";
import {
  applyV0SemanticCounterfactual,
  buildV0SemanticMutationSpecs,
  materializeV0MutationCase,
  type V0AppliedSemanticCounterfactual,
  type V0MaterializedCaseObservation,
  type V0SemanticMutationSpec,
} from "../support/v0-mutation-materializer";

type JsonRecord = Readonly<Record<string, unknown>>;

type MutationControl = Readonly<{
  id: string;
  faultFamily: string;
  operator: string;
  mutatedFault: string;
  killedByCaseIds: readonly string[];
  corroboratedByCaseIds?: readonly string[];
}>;

type MutationFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  requiredFaultFamilies: readonly string[];
  controls: readonly MutationControl[];
}>;

type LawFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  witnesses: readonly Readonly<{ id: string }>[];
}>;

type CaseBinding = ReturnType<typeof buildV0CaseBindings>[number];

type LinkedCaseEvidence = Readonly<{
  caseId: string;
  fixturePath: string;
  channel: V0MaterializedCaseObservation["envelope"]["channel"];
  fixtureRecordSha256: string;
  actualProjection: V0MaterializedCaseObservation["envelope"]["actualProjection"];
  expectedProjection: V0MaterializedCaseObservation["envelope"]["expectedProjection"];
  baselineAccepted: true;
  runtimeRequestSha256: string;
  runtimeResultSha256: string;
  observationDigest: string;
}>;

type ObservedCase = Readonly<{
  binding: CaseBinding;
  materialized: V0MaterializedCaseObservation;
  evidence: LinkedCaseEvidence;
}>;

const mutationFixture = mutationFixtureValue as MutationFixture;
const lawFixture = lawFixtureValue as LawFixture;
const HARNESS_SEED = "changes.v0-mutation-controls.seed.v2:exact-projections";
const ORACLE_ID = "independent-v0-fixture-expectation-v1";

function buildCaseEvidence(
  binding: CaseBinding,
  materialized: V0MaterializedCaseObservation,
): LinkedCaseEvidence {
  const { envelope } = materialized;
  expect(envelope.fixturePath, `${envelope.caseId}: fixture path`).toBe(
    binding.fixturePath,
  );
  const preimage = Object.freeze({
    caseId: envelope.caseId,
    fixturePath: envelope.fixturePath,
    channel: envelope.channel,
    fixtureRecordSha256: binding.fixtureRecordSha256,
    actualProjection: envelope.actualProjection,
    expectedProjection: envelope.expectedProjection,
    baselineAccepted: true as const,
    runtimeRequestSha256: v0EvidenceDigest(envelope.runtimeInput),
    runtimeResultSha256: v0EvidenceDigest(envelope.runtimeOutput),
  });
  return Object.freeze({
    ...preimage,
    observationDigest: v0EvidenceDigest(preimage),
  });
}

function materializeReviewedCases(
  caseIds: readonly string[],
): ReadonlyMap<string, ObservedCase> {
  const bindings = new Map(
    buildV0CaseBindings().map((binding) => [binding.caseId, binding]),
  );
  return new Map(caseIds.map((caseId) => {
    const binding = bindings.get(caseId);
    if (binding === undefined) {
      throw new Error(`${caseId}: missing checked-in fixture binding`);
    }
    const materialized = materializeV0MutationCase(
      caseId,
      binding.fixtureRecordSha256,
    );
    return [caseId, Object.freeze({
      binding,
      materialized,
      evidence: buildCaseEvidence(binding, materialized),
    })] as const;
  }));
}

function buildDetector(
  spec: V0SemanticMutationSpec,
  applied: V0AppliedSemanticCounterfactual,
): JsonRecord {
  const expectedProjectionDigest = v0EvidenceDigest(
    applied.expectedProjection,
  );
  return Object.freeze({
    oracleId: ORACLE_ID,
    reviewedInvariant: spec.reviewedInvariant,
    expectedProjectionDigest,
    baselineAccepted: true,
    mutantAccepted: false,
    sameReviewedExpectation: true,
  });
}

function executeCounterfactual(
  spec: V0SemanticMutationSpec,
  control: MutationControl,
  observed: ObservedCase,
): JsonRecord {
  expect(spec.algorithm, `${control.id}: exact operator binding`).toBe(
    control.operator,
  );
  const applied = applyV0SemanticCounterfactual(observed.materialized, spec);
  const detector = buildDetector(spec, applied);
  const coherence = Object.freeze({
    accepted: true,
    issues: [] as const,
    caseBindingPreserved: applied.caseBindingPreserved,
    noCollateralMutationOutsideTarget: true,
    outOfScopeMismatchPaths: applied.outOfScopeMismatchPaths,
  });
  const expectedProjectionDigest = v0EvidenceDigest(
    applied.expectedProjection,
  );
  const preimage = Object.freeze({
    controlId: control.id,
    caseId: observed.evidence.caseId,
    operator: control.operator,
    algorithm: spec.algorithm,
    mutatedFault: control.mutatedFault,
    faultFamily: control.faultFamily,
    reviewedInvariant: spec.reviewedInvariant,
    executionClass: "semantic-output-counterfactual" as const,
    fixtureRecordSha256: observed.binding.fixtureRecordSha256,
    expectationSource: observed.binding.fixturePath,
    targetPath: applied.targetPath,
    affectedPaths: applied.affectedPaths,
    affectedCount: applied.affectedCount,
    outOfScopeMismatchPaths: applied.outOfScopeMismatchPaths,
    beforeProjection: applied.beforeProjection,
    afterProjection: applied.afterProjection,
    expectedProjection: applied.expectedProjection,
    baselineDetectorProjection: applied.baselineDetectorProjection,
    mutantDetectorProjection: applied.mutantDetectorProjection,
    beforeDigest: v0EvidenceDigest(applied.beforeProjection),
    afterDigest: v0EvidenceDigest(applied.afterProjection),
    expectedProjectionDigest,
    detector,
    detectorDigest: v0EvidenceDigest(detector),
    baselineAccepted: applied.baselineAccepted,
    mutantAccepted: applied.mutantAccepted,
    coherence,
    mutationOperation: applied.mutationOperation,
    baselineObservationDigest: observed.evidence.observationDigest,
    killed: true,
  });
  expect(applied.baselineAccepted, `${control.id}: baseline accepted`).toBe(true);
  expect(applied.mutantAccepted, `${control.id}: mutant rejected`).toBe(false);
  expect(applied.affectedPaths, `${control.id}: exact changed paths`).not
    .toHaveLength(0);
  expect(applied.outOfScopeMismatchPaths, `${control.id}: collateral changes`)
    .toEqual([]);
  return Object.freeze({
    ...preimage,
    executionDigest: v0EvidenceDigest(preimage),
  });
}

function executeAllCounterfactuals(
  observations: ReadonlyMap<string, ObservedCase>,
  specs: readonly V0SemanticMutationSpec[],
): readonly JsonRecord[] {
  const specsById = new Map(specs.map((spec) => [spec.controlId, spec]));
  expect(specs.map(({ controlId }) => controlId)).toEqual(
    mutationFixture.controls.map(({ id }) => id),
  );
  return mutationFixture.controls.flatMap((control) => {
    const spec = specsById.get(control.id);
    if (spec === undefined) throw new Error(`${control.id}: operator missing`);
    expect(Object.keys(spec.cases), `${control.id}: exact direct-link order`)
      .toEqual([...control.killedByCaseIds]);
    return control.killedByCaseIds.map((caseId) => {
      const observed = observations.get(caseId);
      if (observed === undefined) {
        throw new Error(`${control.id}/${caseId}: observation missing`);
      }
      return executeCounterfactual(spec, control, observed);
    });
  });
}

test(
  "executes every V0 law witness and kills every reviewed semantic counterfactual",
  async () => {
    const validation = await validateV0Contract();
    expect(validation.outcome).toBe("pass");
    expect(validation.findings).toEqual([]);

    const partition = inspectV0MutationLinkPartition();
    expect(partition.findings).toEqual([]);
    expect(partition.directLinks).toHaveLength(104);
    expect(partition.corroborativeLinks).toHaveLength(2);
    expect(partition.reviewedLinks).toHaveLength(106);
    expect(partition.linkedCaseIds).toHaveLength(86);

    const runtimeCaseIds = [...new Set([
      ...partition.linkedCaseIds,
      ...lawFixture.witnesses.map(({ id }) => id),
    ])];
    const allObserved = materializeReviewedCases(runtimeCaseIds);
    const runtimePreimages = buildV0RuntimePreimagePool(
      [...allObserved.values()].flatMap(({ materialized }) => [
        materialized.envelope.runtimeInput,
        materialized.envelope.runtimeOutput,
      ]),
    );
    const linkedObservations = new Map(partition.linkedCaseIds.map((caseId) => {
      const observed = allObserved.get(caseId);
      if (observed === undefined) throw new Error(`${caseId}: runtime missing`);
      return [caseId, observed] as const;
    }));
    expect(linkedObservations.size).toBe(86);

    const specs = buildV0SemanticMutationSpecs(new Map(
      [...linkedObservations].map(([caseId, observed]) => [
        caseId,
        observed.materialized.envelope.expectedProjection,
      ]),
    ));
    const firstExecutions = executeAllCounterfactuals(
      linkedObservations,
      specs,
    );
    const secondExecutions = executeAllCounterfactuals(
      linkedObservations,
      specs,
    );
    expect(secondExecutions).toEqual(firstExecutions);
    expect(firstExecutions).toHaveLength(104);

    const executionsByControl = new Map(
      mutationFixture.controls.map((control) => [
        control.id,
        firstExecutions.filter(({ controlId }) => controlId === control.id),
      ]),
    );
    const killedControlIds = mutationFixture.controls.flatMap((control) => {
      const rows = executionsByControl.get(control.id) ?? [];
      return rows.length === control.killedByCaseIds.length &&
          rows.every(({ killed }) => killed === true)
        ? [control.id]
        : [];
    });
    expect(killedControlIds).toEqual(
      mutationFixture.controls.map(({ id }) => id),
    );

    const caseObservations = partition.linkedCaseIds.map((caseId) => {
      const observed = linkedObservations.get(caseId);
      if (observed === undefined) throw new Error(`${caseId}: evidence missing`);
      return observed.evidence;
    });
    const caseObservationDigests = Object.fromEntries(
      caseObservations.map(({ caseId, observationDigest }) => [
        caseId,
        observationDigest,
      ]),
    );
    const corroborativeObservations = partition.corroborativeLinks.map(
      (link) => {
        const observationDigest = caseObservationDigests[link.caseId];
        if (observationDigest === undefined) {
          throw new Error(`${link.controlId}/${link.caseId}: corroboration missing`);
        }
        return Object.freeze({ ...link, observationDigest });
      },
    );
    expect(corroborativeObservations).toHaveLength(2);

    const controlExecutionDigests = Object.fromEntries(
      mutationFixture.controls.map(({ id }) => [
        id,
        v0EvidenceDigest(firstExecutions.filter(
          ({ controlId }) => controlId === id,
        )),
      ]),
    );
    const lawWitnessObservations = lawFixture.witnesses.map(({ id }) => {
        const observed = allObserved.get(id);
        if (observed === undefined) throw new Error(`${id}: witness missing`);
        return observed.evidence;
      });
    const lawWitnessObservationDigests = Object.fromEntries(
      lawWitnessObservations.map(({ caseId, observationDigest }) => [
        caseId,
        observationDigest,
      ]),
    );

    const payload = {
      schema: V0_MUTATION_SCHEMA,
      suite: "laws-and-mutation-controls",
      producer: V0_MUTATION_PRODUCER,
      fixtureSchema: mutationFixture.schema,
      fixtureVersion: mutationFixture.fixtureVersion,
      lawFixtureSchema: lawFixture.schema,
      lawFixtureVersion: lawFixture.fixtureVersion,
      claim: "executable-semantic-counterfactuals-not-source-mutants",
      classification:
        "executable-semantic-counterfactuals-with-independent-fixture-oracles-not-source-mutants",
      oracleId: ORACLE_ID,
      seed: HARNESS_SEED,
      deterministicReplayRuns: 2,
      controlIds: mutationFixture.controls.map(({ id }) => id),
      controlsDefined: mutationFixture.controls.length,
      requiredFaultFamilies: mutationFixture.requiredFaultFamilies,
      faultFamiliesObserved: [
        ...new Set(mutationFixture.controls.map(({ faultFamily }) => faultFamily)),
      ].sort(),
      semanticOperatorsExecuted: killedControlIds.length,
      semanticOperatorsKilled: killedControlIds.length,
      semanticOperatorsSurvived:
        mutationFixture.controls.length - killedControlIds.length,
      directLinksReviewed: partition.directLinks.length,
      directLinksExecuted: firstExecutions.length,
      directLinksKilled: firstExecutions.length,
      directLinksSurvived: 0,
      directKillerLinksReviewed: partition.directLinks.length,
      directKillerLinksExecuted: firstExecutions.length,
      directKillerLinksKilled: firstExecutions.length,
      directKillerLinksSurvived: 0,
      corroborativeLinksReviewed: partition.corroborativeLinks.length,
      corroborativeLinksObserved: corroborativeObservations.length,
      reviewedLinks: partition.reviewedLinks.length,
      reviewedCaseLinks: partition.reviewedLinks.length,
      totalReviewedLinks: partition.reviewedLinks.length,
      linkedCaseIds: partition.linkedCaseIds,
      linkedCasesObserved: caseObservations.length,
      linkedCasesUnaccounted: [],
      lawWitnessesObserved: lawFixture.witnesses.length,
      lawWitnessObservations,
      lawWitnessObservationDigests,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      runtimePreimagePool: runtimePreimages.entries,
      runtimePreimagePoolEntries: runtimePreimages.entries.length,
      runtimePreimagePoolCanonicalBytes: runtimePreimages.canonicalBytes,
      runtimePreimagePoolEncodedBytes: runtimePreimages.encodedBytes,
      caseObservations,
      caseObservationDigests,
      counterfactualExecutions: firstExecutions,
      corroborativeObservations,
      controlExecutionDigests,
      directLinkInventorySha256: partition.directLinkInventorySha256,
      corroborativeLinkInventorySha256:
        partition.corroborativeLinkInventorySha256,
      reviewedLinkInventorySha256: partition.reviewedLinkInventorySha256,
      status: "pass",
    } as const;
    const signed = signV0EvidenceObservation(payload);
    expect(signed.semanticDigest).toBe(v0EvidenceDigest(payload));
    console.log(`V0_RUNTIME_PREIMAGE_POOL_SUMMARY ${JSON.stringify({
      entries: runtimePreimages.entries.length,
      canonicalBytes: runtimePreimages.canonicalBytes,
      encodedBytes: runtimePreimages.encodedBytes,
    })}`);
    console.log(`${V0_MUTATION_MARKER}${JSON.stringify(signed)}`);
  },
  180_000,
);
