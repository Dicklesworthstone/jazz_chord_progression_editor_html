import {
  normalizeBeatValue,
  parseStableId,
  type BeatValue,
  type ChordEventId,
} from "../../src/domain";
import { generateContextualContinuations } from "../../src/theory/contextual-continuation";
import { decodeChordProGrid } from "../../src/theory/chordpro-grid";
import { formatChordSymbol } from "../../src/theory/chord-symbol";

const REQUEST_SCHEMA = "frankenjazz.native-continuation-request.v1";
const RESPONSE_SCHEMA = "frankenjazz.native-continuation-response.v1";
const MAX_REQUEST_CHARACTERS = 16_384;
const SONGBOOK_REQUEST_SCHEMA = "frankenjazz.native-songbook-request.v1";
const SONGBOOK_RESPONSE_SCHEMA = "frankenjazz.native-songbook-response.v1";

// JavaScriptCore has Uint8Array but no TextEncoder. The shared parser uses
// TextEncoder only for its strict byte budget, so provide that operation here.
if (typeof globalThis.TextEncoder === "undefined") {
  Object.defineProperty(globalThis, "TextEncoder", {
    value: class {
      encode(input = ""): Uint8Array {
        const bytes: number[] = [];
        for (const point of input) {
          let value = point.codePointAt(0) ?? 0xfffd;
          if (value >= 0xd800 && value <= 0xdfff) value = 0xfffd;
          if (value < 0x80) bytes.push(value);
          else if (value < 0x800) bytes.push(0xc0 | (value >> 6), 0x80 | (value & 63));
          else if (value < 0x10000) bytes.push(0xe0 | (value >> 12), 0x80 | ((value >> 6) & 63), 0x80 | (value & 63));
          else bytes.push(0xf0 | (value >> 18), 0x80 | ((value >> 12) & 63), 0x80 | ((value >> 6) & 63), 0x80 | (value & 63));
        }
        return Uint8Array.from(bytes);
      }
    },
  });
}

function songbook(raw: unknown): string {
  const refuse = (message: string, line = 0): string => JSON.stringify({
    schema: SONGBOOK_RESPONSE_SCHEMA, ok: false, message, line,
  });
  try {
    if (typeof raw !== "string" || raw.length > 20_000) return refuse("Songbook request is too large.");
    const request: unknown = JSON.parse(raw);
    if (typeof request !== "object" || request === null || Array.isArray(request)) return refuse("Invalid songbook request.");
    const record = request as Record<string, unknown>;
    if (record["schema"] !== SONGBOOK_REQUEST_SCHEMA || typeof record["source"] !== "string") return refuse("Invalid songbook request.");
    const decoded = decodeChordProGrid(record["source"]);
    if (!decoded.ok) return refuse(decoded.message, decoded.line);
    const bars = [];
    for (const bar of decoded.grid.bars) {
      const events = [];
      for (const event of bar) {
        const formatted = formatChordSymbol(event.chord, "ascii");
        if (!formatted.ok) return refuse("A parsed chord could not be formatted exactly.");
        events.push({ symbol: formatted.canonicalText, quarters: event.quarters });
      }
      bars.push(events);
    }
    return JSON.stringify({
      schema: SONGBOOK_RESPONSE_SCHEMA, ok: true,
      grid: { title: decoded.grid.title, tempo: decoded.grid.tempo, comments: decoded.grid.comments, bars },
    });
  } catch {
    return refuse("The songbook parser could not read this source.");
  }
}

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
  value: Object.freeze({ continuations, songbook }),
});
