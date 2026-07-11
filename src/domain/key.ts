import type { SpelledPitchClass } from "./pitch";

export const KEY_MODES = [
  "major",
  "natural-minor",
  "harmonic-minor",
  "melodic-minor",
] as const;

export type KeyMode = (typeof KEY_MODES)[number];

export type KeyModeRefusal = Readonly<{
  code: "key.mode_invalid";
  received: string;
}>;

export type KeyModeResult =
  | Readonly<{ ok: true; value: KeyMode }>
  | Readonly<{ ok: false; refusal: KeyModeRefusal }>;

export type KeyContext = Readonly<{
  tonic: SpelledPitchClass;
  mode: KeyMode;
}>;
