/**
 * Adapted concept from /dp/frankensim/crates/fs-time/src/symplectic.rs at
 * commit b47259187a31b704f8f0faf6abdf49b32919b96a, retrieved 2026-08-06.
 * Local modification: TypeScript callback/scratch API and explicit shape
 * refusal. Distributed under this repository's MIT License with the OpenAI/Anthropic Rider,
 * per the owner's recorded license decision.
 */

export function verletStep(
  positions: number[],
  momenta: number[],
  stepSeconds: number,
  force: (positions: readonly number[], output: number[]) => void,
  scratch: number[],
): boolean {
  if (
    positions.length !== momenta.length ||
    positions.length !== scratch.length ||
    positions.length === 0 ||
    !Number.isFinite(stepSeconds) ||
    stepSeconds <= 0
  ) return false;
  force(positions, scratch);
  for (let index = 0; index < positions.length; index += 1) {
    momenta[index] = (momenta[index] ?? 0) + 0.5 * stepSeconds * (scratch[index] ?? 0);
    positions[index] = (positions[index] ?? 0) + stepSeconds * (momenta[index] ?? 0);
  }
  force(positions, scratch);
  for (let index = 0; index < positions.length; index += 1) {
    momenta[index] = (momenta[index] ?? 0) + 0.5 * stepSeconds * (scratch[index] ?? 0);
  }
  return true;
}
