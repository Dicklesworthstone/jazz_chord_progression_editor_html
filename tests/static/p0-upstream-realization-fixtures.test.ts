import { describe, expect, test } from "bun:test";

import sourceCatalogValue from "../fixtures/playback-plan/source-catalog.json";

import {
  makeAutoVoicing,
  type AutoVoicing,
  type ChordSpec,
} from "../../src/domain";
import {
  parseChordSymbol,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
  type VoicingCandidate,
} from "../../src/theory";
import {
  findV0CandidateWithExpectedVoices,
  v0DegreeToken,
  type V0CandidateSuccessExpectation,
} from "../support/v0-voicing-fixture";

type ParsedChordSpec = Extract<ChordSpec, { readonly kind: "parsed" }>;

type P0GeneratedCandidateSeed = Readonly<{
  id: string;
  candidateFixtureRef: string;
  schema: VoicingCandidate["schema"];
  engineId: VoicingCandidate["engineId"];
  engineVersion: VoicingCandidate["engineVersion"];
  family: VoicingCandidate["family"];
  realizationId: VoicingCandidate["realizationId"];
  voices: VoicingCandidate["voices"];
  pitches: VoicingCandidate["pitches"];
}>;

type P0GeneratedSource = Readonly<{
  id: string;
  chord: ParsedChordSpec;
  voicing: AutoVoicing;
  bindingKind: "generated";
  autoRequestSeed: Readonly<{
    schema: AutoVoicingRequest["schema"];
    kind: "auto";
    resolvedFixtureRef: string;
    resolvedSourceMustEqualChord: true;
    realizationId: AutoVoicingRequest["realizationId"];
    policyRef: "voicing";
    quartalContext: AutoVoicingRequest["quartalContext"];
  }>;
  candidateSeed: P0GeneratedCandidateSeed;
}>;

type P0StoredSourceStub = Readonly<{
  id: string;
  bindingKind: "stored";
}>;

type P0SourceCatalogFixture = Readonly<{
  sources: readonly (P0GeneratedSource | P0StoredSourceStub)[];
}>;

const sourceCatalog =
  sourceCatalogValue as unknown as P0SourceCatalogFixture;
const generatedSources = sourceCatalog.sources.filter(
  (source): source is P0GeneratedSource =>
    source.bindingKind === "generated",
);

function expectedVoicesFromSeed(
  seed: P0GeneratedCandidateSeed,
): V0CandidateSuccessExpectation {
  return {
    kind: "must-contain-candidate",
    voices: seed.voices.map((voice) => ({
      spelling: { ...voice.pitch },
      midi: voice.midi,
      degree: voice.degree === null ? null : v0DegreeToken(voice.degree),
      sourceDegreeIndex: voice.sourceDegreeIndex,
      provenance: voice.provenance,
    })),
  };
}

function requireParsedSource(source: P0GeneratedSource): ParsedChordSpec {
  const parsed = parseChordSymbol(source.chord.sourceText, "ascii");
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(
      `${source.id}: T0 refused the source symbol with ${parsed.diagnostics[0].code}`,
    );
  }
  expect(parsed.chord).toEqual(source.chord);
  return parsed.chord;
}

describe("P0 generated source seeds are exact upstream T0/T1/V0 outcomes", () => {
  test("the source catalog keeps generated witnesses in scope", () => {
    expect(generatedSources.length).toBeGreaterThan(0);
  });

  for (const source of generatedSources) {
    test(`${source.id} selects its exact authored candidate seed`, () => {
      expect(source.autoRequestSeed.resolvedSourceMustEqualChord).toBe(true);
      expect(source.autoRequestSeed.policyRef).toBe("voicing");

      const parsed = requireParsedSource(source);
      const resolved = resolveChord(parsed);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) {
        throw new Error(
          `${source.id}: T1 refused the parsed source with ${resolved.refusal.code}`,
        );
      }
      expect(resolved.value.source).toEqual(source.chord);
      expect(
        resolved.value.realizations.some(
          ({ id }) => id === source.autoRequestSeed.realizationId,
        ),
      ).toBe(true);

      const policy = makeAutoVoicing(source.voicing, resolved.value.bass);
      expect(policy.ok).toBe(true);
      if (!policy.ok) {
        throw new Error(
          `${source.id}: F1 refused the exact Auto policy with ${policy.refusal.code}`,
        );
      }
      expect(policy.value).toEqual(source.voicing);

      const request = Object.freeze({
        schema: source.autoRequestSeed.schema,
        kind: source.autoRequestSeed.kind,
        resolved: resolved.value,
        realizationId: source.autoRequestSeed.realizationId,
        policy: policy.value,
        quartalContext: source.autoRequestSeed.quartalContext,
      }) as unknown as AutoVoicingRequest;
      const result = realizeVoicing(request);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(
          `${source.id}: V0 refused the exact request with ${result.refusal.code}`,
        );
      }
      expect(result.value.kind).toBe("generated");
      expect(result.value.policy).toEqual(source.voicing);
      expect(result.value.realizationId).toBe(
        source.autoRequestSeed.realizationId,
      );

      const candidate = findV0CandidateWithExpectedVoices(
        result.value.candidates,
        expectedVoicesFromSeed(source.candidateSeed),
      );
      expect(candidate).toBeDefined();
      if (candidate === undefined) {
        throw new Error(
          `${source.id}: exact seed ${source.candidateSeed.id} was absent from ${String(result.value.candidates.length)} retained V0 candidates`,
        );
      }

      expect({
        schema: candidate.schema,
        engineId: candidate.engineId,
        engineVersion: candidate.engineVersion,
        family: candidate.family,
        realizationId: candidate.realizationId,
        voices: candidate.voices,
        pitches: candidate.pitches,
      }).toEqual({
        schema: source.candidateSeed.schema,
        engineId: source.candidateSeed.engineId,
        engineVersion: source.candidateSeed.engineVersion,
        family: source.candidateSeed.family,
        realizationId: source.candidateSeed.realizationId,
        voices: source.candidateSeed.voices,
        pitches: source.candidateSeed.pitches,
      });
    });
  }
});
