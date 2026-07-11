export const INSTRUMENT_IDS = [
  "mellow-keys",
  "fm-electric-piano",
  "vibraphone",
  "warm-pad",
  "analog-poly",
] as const;

export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export type InstrumentIdRefusal = Readonly<{
  code: "document.instrument_id_invalid";
  received: string;
}>;

export type InstrumentIdResult =
  | Readonly<{ ok: true; value: InstrumentId }>
  | Readonly<{ ok: false; refusal: InstrumentIdRefusal }>;
