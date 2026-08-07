import type { InstrumentId } from "../domain";
import { sha256Hex } from "./deterministic-sha256";

/**
 * Reviewed, canonical foundry artifact consumed by the clarinet-v2 DSP.
 *
 * The value is duplicated into the generated Rust table so both sides of the
 * WASM boundary name the same immutable physics input. The foundry unit test
 * regenerates that table and checks both copies against the canonical JSON.
 */
export const CLARINET_V2_PARAMETER_PACK_SHA256 =
  "56c0f4ba9015e2f088070290bf9150edbf7368f16a799b9fbf9986af6505f42e";

/** Exact pack identity for render-plan fingerprints and memoization. */
export function physicalParameterPackSha256(
  instrumentId: InstrumentId,
): string {
  if (instrumentId === "clarinet") {
    return CLARINET_V2_PARAMETER_PACK_SHA256;
  }
  // PHS3-PHS6 replace these stable pre-pack identities as each reviewed
  // family pack lands; keeping them distinct preserves today's cache law.
  return sha256Hex(`changes.physical.parameter-pack.${instrumentId}.v1`);
}
