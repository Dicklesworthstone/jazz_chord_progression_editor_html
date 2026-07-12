import type { SpelledPitchClass } from "./pitch";
import type { PathRefusal } from "./result";

export const KEY_MODES = [
  "major",
  "natural-minor",
  "harmonic-minor",
  "melodic-minor",
] as const;

export type KeyMode = (typeof KEY_MODES)[number];

export type KeyModeRefusal = PathRefusal<{
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

function isKeyMode(received: string): received is KeyMode {
  return (
    received === "major" ||
    received === "natural-minor" ||
    received === "harmonic-minor" ||
    received === "melodic-minor"
  );
}

export function makeKeyMode(received: string): KeyModeResult {
  if (!isKeyMode(received)) {
    return {
      ok: false,
      refusal: { code: "key.mode_invalid", path: ["mode"], received },
    };
  }
  return { ok: true, value: received };
}
