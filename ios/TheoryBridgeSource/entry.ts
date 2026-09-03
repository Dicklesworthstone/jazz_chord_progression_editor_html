import {
  normalizeBeatValue,
  parseStableId,
  type BeatValue,
  type ChordEventId,
} from "../../src/domain";
import { generateContextualContinuations } from "../../src/theory/contextual-continuation";

const REQUEST_SCHEMA = "frankenjazz.native-continuation-request.v1";
const RESPONSE_SCHEMA = "frankenjazz.native-continuation-response.v1";
const MAX_REQUEST_CHARACTERS = 16_384;

type NativeRequest = Readonly<{
  schema: typeof REQUEST_SCHEMA;
  context: readonly string[];
}>;

function beat(numerator: number): BeatValue {
  const result = normalizeBeatValue({ numerator, denominator: 1 });
  if (!result.ok) throw new Error(result.refusal.code);
  return result.value;
}

function eventId(index: number): ChordEventId {
  const result = parseStableId("event", `native_context_${String(index)}`);
  if (!result.ok) throw new Error(result.refusal.code);
  return result.value;
}

function decodeRequest(raw: unknown): NativeRequest {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_REQUEST_CHARACTERS) {
    throw new Error("native.request_size");
  }
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("native.request_shape");
  }
  const record = value as Record<string, unknown>;
  if (record["schema"] !== REQUEST_SCHEMA || !Array.isArray(record["context"])) {
    throw new Error("native.request_schema");
  }
  if (record["context"].length === 0 || record["context"].length > 8) {
    throw new Error("native.context_count");
  }
  if (!record["context"].every((symbol) => typeof symbol === "string" && symbol.length > 0 && symbol.length <= 128)) {
    throw new Error("native.context_symbol");
  }
  return { schema: REQUEST_SCHEMA, context: record["context"] as string[] };
}

function continuations(raw: unknown): string {
  try {
    const request = decodeRequest(raw);
    const events = request.context.map((chordSymbol, index) => ({
      eventId: eventId(index),
      chordSymbol,
      offsetBeat: beat(index * 4),
      duration: beat(4),
    }));
    const result = generateContextualContinuations(events, { maxDisplayOptions: 8 });
    if (!result.ok) {
      return JSON.stringify({
        schema: RESPONSE_SCHEMA,
        ok: false,
        refusal: result.refusal,
      });
    }
    return JSON.stringify({
      schema: RESPONSE_SCHEMA,
      ok: true,
      engineSchema: result.schema,
      workSteps: result.workSteps,
      candidates: result.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        chordSymbol: candidate.chordSymbol,
        category: candidate.category,
        providerId: candidate.providerId,
        rank: candidate.rank,
        voiceLeadingScore: candidate.proof.voiceLeadingScore,
        tensionDelta: candidate.proof.tensionDelta,
        preservedGuideTones: candidate.proof.preservedGuideTones,
        expectedMotion: candidate.proof.expectedMotion,
        whyExplanation: candidate.proof.whyExplanation,
        whyNotConsiderations: candidate.proof.whyNotConsiderations ?? [],
      })),
    });
  } catch (error) {
    return JSON.stringify({
      schema: RESPONSE_SCHEMA,
      ok: false,
      refusal: {
        code: "native.bridge_refused",
        message: error instanceof Error ? error.message : "Unknown bridge refusal",
      },
    });
  }
}

Object.defineProperty(globalThis, "FrankenJazzTheoryBridge", {
  configurable: false,
  enumerable: true,
  writable: false,
  value: Object.freeze({ continuations }),
});
