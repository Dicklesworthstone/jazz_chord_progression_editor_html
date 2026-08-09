import type { PathRefusal } from "./result";

export const INSTRUMENT_IDS = [
  "mellow-keys",
  "fm-electric-piano",
  "vibraphone",
  "warm-pad",
  "analog-poly",
  "concert-grand",
  "flute",
  "organ",
  "guitar",
  "upright-bass",
  "concert-vibes",
  "blues-guitar",
  "clarinet",
  "dreadnought-guitar",
  "ukulele",
] as const;

export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export type InstrumentIdRefusal = PathRefusal<{
  code: "document.instrument_id_invalid";
  received: string;
}>;

export type InstrumentIdResult =
  | Readonly<{ ok: true; value: InstrumentId }>
  | Readonly<{ ok: false; refusal: InstrumentIdRefusal }>;

function isInstrumentId(received: string): received is InstrumentId {
  return (
    received === "mellow-keys" ||
    received === "fm-electric-piano" ||
    received === "vibraphone" ||
    received === "warm-pad" ||
    received === "analog-poly" ||
    received === "concert-grand" ||
    received === "flute" ||
    received === "organ" ||
    received === "guitar" ||
    received === "upright-bass" ||
    received === "concert-vibes" ||
    received === "blues-guitar" ||
    received === "clarinet" ||
    received === "dreadnought-guitar" ||
    received === "ukulele"
  );
}

export function makeInstrumentId(received: string): InstrumentIdResult {
  if (!isInstrumentId(received)) {
    return {
      ok: false,
      refusal: {
        code: "document.instrument_id_invalid",
        path: ["instrumentId"],
        received,
      },
    };
  }
  return { ok: true, value: received };
}
